import { Query } from "mongoose";
import { getPagination } from "./common.utils";

interface QueryString {
  keyword?: string;
  page?: string | number;
  limit?: string | number;
  brand?: string;
  category?: string;
  price?: string | number;
  rating?: string | number;
  discount?: string | number;
  stock?: string | number;
  [key: string]: any;
}

interface FilterQuery {
  name?: {
    $regex: string;
    $options: string;
  };
  brand?: {
    $in: string[];
  };
  category?: string | { $in: string[] };
  [key: string]: any;
}

class SearchFeatures {
  public query: Query<any[], any>;
  private queryStr: QueryString;
  private readonly EXCLUDED_FIELDS = ["keyword", "page", "limit", "sort", "fields"];
  private readonly MULTI_VALUE_FIELDS = ["brand", "category", "subCategory"];

  constructor(query: Query<any[], any>, queryStr: QueryString) {
    this.query = query;
    this.queryStr = queryStr || {};
  }

  /**
   * Searches products by keyword across multiple fields
   * Uses MongoDB text search or regex pattern matching
   * @returns {SearchFeatures} Returns this for method chaining
   */
  search(): this {
    if (!this.queryStr.keyword?.toString().trim()) {
      return this;
    }

    const keyword = this.queryStr.keyword
      .toString()
      .trim()
      .slice(0, 80)
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Use regex search instead of $text for partial string matching and autocomplete support
    this.query = this.query.find({
      $or: [
        { name: { $regex: keyword, $options: "i" } },
        { description: { $regex: keyword, $options: "i" } },
        { "seo.keywords": { $regex: keyword, $options: "i" } }
      ]
    });
    return this;
  }

  /**
   * Applies filters for category, price range, rating, brand, etc.
   * Supports MongoDB comparison operators (gt, gte, lt, lte)
   * Handles nested category filtering with population
   * @returns {SearchFeatures} Returns this for method chaining
   */
  filter(): this {
    const queryCopy: any = { ...this.queryStr };

    // Remove fields that shouldn't be used for filtering
    this.EXCLUDED_FIELDS.forEach((field) => delete queryCopy[field]);

    // ✅ NEW: convert keys like "price[gte]" into:
    // { price: { gte: "500" } }
    Object.keys(queryCopy).forEach((key) => {
      const match = key.match(/^(\w+)\[(\w+)\]$/); // e.g. "price[gte]"
      if (match) {
        const field = match[1];    // "price"
        const operator = match[2]; // "gte"

        if (!queryCopy[field] || typeof queryCopy[field] !== "object") {
          queryCopy[field] = {};
        }

        // keep raw value for now (string), we'll Number() it later
        queryCopy[field][operator] = queryCopy[key];

        // remove the original "price[gte]" key
        delete queryCopy[key];
      }
    });

    if (Object.keys(queryCopy).length === 0) {
      this.query = this.query.find({ isActive: true });
      return this;
    }

    // Convert comparison operators (gt, gte, lt, lte) to MongoDB syntax ($gt, $gte, ...)
    let queryStr = JSON.stringify(queryCopy);
    queryStr = queryStr.replace(
      /\b(gt|gte|lt|lte|ne|in|nin)\b/g,
      (operator) => `$${operator}`
    );

    const filterObject: FilterQuery = JSON.parse(queryStr);

    // Handle multi-value fields (comma-separated values)
    this.MULTI_VALUE_FIELDS.forEach((field) => {
      if (queryCopy[field]) {
        const values = queryCopy[field]
          .toString()
          .split(",")
          .map((val: string) => val.trim())
          .filter((val: string) => val.length > 0);

        if (values.length > 0) {
          filterObject[field] = { $in: values };
        }
      }
    });

    // ✅ price validation - Map 'price' query param to 'sellingPrice' database field
    if (filterObject.price) {
      filterObject.sellingPrice = filterObject.price;
      delete filterObject.price;

      const priceFilter = filterObject.sellingPrice;

      if (typeof priceFilter === "object") {
        Object.keys(priceFilter).forEach((key) => {
          const value = Number(priceFilter[key]);
          if (isNaN(value) || value < 0) {
            delete priceFilter[key];
          } else {
            priceFilter[key] = value;
          }
        });
        if (Object.keys(priceFilter).length === 0) delete filterObject.sellingPrice;
      } else {
        const value = Number(priceFilter);
        if (!isNaN(value) && value >= 0) {
          filterObject.sellingPrice = value;
        } else {
          delete filterObject.sellingPrice;
        }
      }
    }

    // ✅ rating validation (1–5) and mapping to ratings.average
    if (filterObject.rating) {
      const ratingFilter = filterObject.rating;

      if (typeof ratingFilter === "object") {
        Object.keys(ratingFilter).forEach((key) => {
          const value = Number(ratingFilter[key]);
          if (isNaN(value) || value < 1 || value > 5) {
            delete ratingFilter[key];
          } else {
            ratingFilter[key] = value;
          }
        });

        if (Object.keys(ratingFilter).length > 0) {
          filterObject["ratings.average"] = ratingFilter;
        }
      } else {
        const value = Number(ratingFilter);
        if (!isNaN(value) && value >= 1 && value <= 5) {
          filterObject["ratings.average"] = value;
        }
      }
      delete filterObject.rating;
    }

    // ✅ discount validation (0–100)
    if (filterObject.discount) {
      const discountFilter = filterObject.discount;

      if (typeof discountFilter === "object") {
        Object.keys(discountFilter).forEach((key) => {
          const value = Number(discountFilter[key]);
          if (isNaN(value) || value < 0 || value > 100) {
            delete discountFilter[key];
          } else {
            discountFilter[key] = value;
          }
        });
        if (Object.keys(discountFilter).length === 0) delete filterObject.discount;
      } else {
        const value = Number(discountFilter);
        if (!isNaN(value) && value >= 0 && value <= 100) {
          filterObject.discount = value;
        } else {
          delete filterObject.discount;
        }
      }
    }

    // stock / inStock
    if (queryCopy.inStock !== undefined) {
      const inStock = queryCopy.inStock.toString().toLowerCase();
      if (inStock === "true" || inStock === "1") {
        filterObject.stock = { $gt: 0 };
      } else if (inStock === "false" || inStock === "0") {
        filterObject.stock = 0;
      }
      delete filterObject.inStock;
    }

    // ✅ Force only active products (Critical for performance + business logic)
    filterObject.isActive = true;

    this.query = this.query.find(filterObject);
    return this;
  }


  /**
   * Applies pagination to the query
   * @param {number} resultPerPage - Number of results per page
   * @returns {SearchFeatures} Returns this for method chaining
   */
  pagination(resultPerPage: number): this {
    const { skip, limit } = getPagination(this.queryStr.page, resultPerPage);

    this.query = this.query.limit(limit).skip(skip);
    return this;
  }

  /**
   * Sorts the query results
   * @param {string} sortBy - Field to sort by (prefix with '-' for descending)
   * @returns {SearchFeatures} Returns this for method chaining
   */
  sort(sortBy?: string): this {
    if (this.queryStr.sort) {
      const sortFields = this.queryStr.sort.toString().split(",").join(" ");
      this.query = this.query.sort(sortFields);
    } else if (sortBy) {
      this.query = this.query.sort(sortBy);
    } else {
      // Default sort by creation date (newest first)
      this.query = this.query.sort("-createdAt");
    }

    return this;
  }

  /**
   * Selects specific fields to return
   * @returns {SearchFeatures} Returns this for method chaining
   */
  selectFields(): this {
    if (this.queryStr.fields) {
      const fields = this.queryStr.fields.toString().split(",").join(" ");
      this.query = this.query.select(fields);
    }

    return this;
  }

  /**
   * Gets the total count of documents matching the current query
   * @returns {Promise<number>} Total document count
   */
  async countDocuments(): Promise<number> {
    return await this.query.clone().countDocuments();
  }
}

export default SearchFeatures;

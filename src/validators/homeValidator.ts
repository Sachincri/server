import { IBanner, ICarouselItem, IProductItem, ISection, ISEO, IVideoReel } from '../types/homeTypes';


const validateUrl = (url: string, fieldName: string, optional = false): string | null => {
  if (!url || url.trim() === "") return optional ? null : `${fieldName} is required`;
  // Allow "pending" placeholder used by frontend during file uploads
  if (url === "pending") return null;
  try {
    // allow http/https and relative paths
    new URL(url);
    return null;
  } catch {
    if (url.startsWith("/") || url.startsWith("http")) return null;
    return `${fieldName} must be a valid URL`;
  }
};

export const validateSlug = (slug: string): string | null => {
  if (!slug || slug.trim() === "") return "Slug is required";
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!slugRegex.test(slug))
    return 'Slug must be lowercase, alphanumeric with hyphens only (e.g., "home-page")';
  return null;
};

export const validateSEO = (seo?: ISEO): string[] => {
  const errors: string[] = [];
  if (!seo) return errors;
  if (seo.slug) {
    const e = validateSlug(seo.slug);
    if (e) errors.push(e);
  }
  if (seo.ogImage) {
    // ogImage is ImageLink { public_id, url }
    const imageUrl = typeof seo.ogImage === "string" ? seo.ogImage : seo.ogImage.url;
    const e = validateUrl(imageUrl, "OG Image");
    if (e) errors.push(e);
  }
  if (seo.metaDescription && seo.metaDescription.length > 160) {
    errors.push(
      "Meta description should not exceed 160 characters for optimal SEO"
    );
  }
  if (seo.title && seo.title.length > 60) {
    errors.push(
      "SEO title should not exceed 60 characters for optimal display"
    );
  }
  return errors;
};

export const validateCarousel = (carousel?: { items: ICarouselItem[] }): string[] => {
  const errors: string[] = [];
  if (!carousel || !carousel.items) {
    errors.push("Carousel is required");
    return errors;
  }
  if (!Array.isArray(carousel.items)) {
    errors.push("Carousel items must be an array");
    return errors;
  }
  if (carousel.items.length === 0)
    errors.push("Carousel must have at least one item");
  if (carousel.items.length > 10)
    errors.push("Carousel should not exceed 10 items for performance");
  carousel.items.forEach((item, i) => {
    if (!item.image) errors.push(`Carousel item ${i + 1}: Image is required`);
    else {
      if (Array.isArray(item.image)) {
        item.image.forEach((img, imgIdx) => {
          const imageUrl = typeof img === "string" ? img : img.url;
          const e = validateUrl(imageUrl, `Carousel item ${i + 1} image ${imgIdx + 1}`);
          if (e) errors.push(e);
        });
      } else {
        const imageUrl = typeof item.image === "string" ? item.image : item.image?.url;
        const e = validateUrl(imageUrl, `Carousel item ${i + 1} image`);
        if (e) errors.push(e);
      }
    }
    if (item.redirectLink) {
      const e = validateUrl(
        item.redirectLink,
        `Carousel item ${i + 1} redirect link`,
        true // optional
      );
      if (e) errors.push(e);
    }
  });
  return errors;
};

const validateBanner = (
  banner: IBanner | undefined | null,
  sectionName: string
): string[] => {
  const errors: string[] = [];
  if (!banner) {
    errors.push(`${sectionName}: Banner data is required`);
    return errors;
  }
  if (!banner.image) errors.push(`${sectionName}: Banner image is required`);
  else {
    if (Array.isArray(banner.image)) {
      banner.image.forEach((img, imgIdx) => {
        const e = validateUrl(img, `${sectionName} image ${imgIdx + 1}`);
        if (e) errors.push(e);
      });
    } else {
      // If banner.image is an object (ImageLink), extract the URL string property
      const imageUrl = typeof banner.image === "string" ? banner.image : banner.image.url;
      const e = validateUrl(imageUrl, `${sectionName} image`);
      if (e) errors.push(e);
    }
  }
  if (banner.redirectLink) {
    const e = validateUrl(banner.redirectLink, `${sectionName} redirect link`, true);
    if (e) errors.push(e);
  }
  return errors;
};

const validateProductItems = (
  items: IProductItem[] | undefined,
  sectionName: string
): string[] => {
  const errors: string[] = [];
  if (!Array.isArray(items)) {
    errors.push(`${sectionName}: Products items must be an array`);
    return errors;
  }
  if (items.length === 0)
    errors.push(`${sectionName}: Products section must have at least one item`);
  if (items.length > 50)
    errors.push(
      `${sectionName}: Products section should not exceed 50 items for performance`
    );
  items.forEach((it, idx) => {
    if (!it.image)
      errors.push(`${sectionName} - Product ${idx + 1}: Image is required`);
    else {
      // If it.image is an object (ImageLink), extract the URL string property
      const imageUrl = typeof it.image === "string" ? it.image : it.image.url;
      const e = validateUrl(
        imageUrl,
        `${sectionName} - Product ${idx + 1} image`
      );
      if (e) errors.push(e);
    }
    if (!it.title || it.title.trim() === "")
      errors.push(`${sectionName} - Product ${idx + 1}: Title is required`);
    if (it.redirectLink) {
      const e = validateUrl(
        it.redirectLink,
        `${sectionName} - Product ${idx + 1} redirect link`
      );
      if (e) errors.push(e);
    }
  });
  return errors;
};

export const validateSections = (sections?: ISection[]): string[] => {
  const errors: string[] = [];
  if (!sections) return errors; // optional
  if (!Array.isArray(sections)) {
    errors.push("Sections must be an array");
    return errors;
  }
  const orderNumbers = new Set<number>();
  const validTypes = ["banner1", "banner2", "banner3", "products", "quad_grid", "single_product_carousel", "video_reels"];
  sections.forEach((section, idx) => {
    const name = `Section ${idx + 1}`;
    if (section.order === undefined || section.order === null) {
      errors.push(`${name}: Order is required`);
    } else if (typeof section.order !== "number") {
      errors.push(`${name}: Order must be a number`);
    } else if (section.order < 2) {
      errors.push(`${name}: Order must be 2 or greater (carousel is order 1)`);
    } else if (orderNumbers.has(section.order)) {
      errors.push(`${name}: Duplicate order number ${section.order}`);
    } else {
      orderNumbers.add(section.order);
    }
    if (!section.type) {
      errors.push(`${name}: Type is required`);
    } else if (!validTypes.includes(section.type)) {
      errors.push(`${name}: Type must be one of ${validTypes.join(", ")}`);
    }
    if (
      section.type === "banner1" ||
      section.type === "banner2" ||
      section.type === "banner3"
    ) {
      if (!section.banners || section.banners.length === 0) {
        errors.push(`${name}: Banners are required for banner type`);
      } else {
        section.banners.forEach((banner, bIdx) => {
          errors.push(...validateBanner(banner, `${name} - Banner ${bIdx + 1}`));
        });
      }
    } else if (section.type === "products") {
      if (!section.products)
        errors.push(`${name}: Products data is required for product type`);
      else errors.push(...validateProductItems(section.products.items, name));
    } else if (section.type === "quad_grid") {
      if (!section.quads || section.quads.length === 0) {
        errors.push(`${name}: Quads are required for quad_grid type`);
      } else {
        section.quads.forEach((quad, qIdx) => {
          const quadName = `${name} - Quad ${qIdx + 1}`;
          if (!quad.title) errors.push(`${quadName}: Title is required`);
          
          // Relax validation: items are optional (could be filled from product table)
          if (quad.items && Array.isArray(quad.items)) {
            quad.items.forEach((item, iIdx) => {
              const itemName = `${quadName} - Item ${iIdx + 1}`;
              // Make image and title optional during update
              if (item.image) {
                const imageUrl = typeof item.image === "string" ? item.image : item.image.url;
                if (imageUrl) {
                   const e = validateUrl(imageUrl, `${itemName} image`);
                   if (e) errors.push(e);
                }
              }
              // Title and Redirect Link can be validated if they exist, but aren't strictly required
              if (item.redirectLink) {
                const e = validateUrl(item.redirectLink, `${itemName} redirect link`);
                if (e) errors.push(e);
              }
            });
          }
        });
      }
    } else if (section.type === "video_reels") {
      if (!section.videoReels || !Array.isArray(section.videoReels) || section.videoReels.length === 0) {
        errors.push(`${name}: At least one video reel is required for video_reels type`);
      } else {
        if (section.videoReels.length > 10) {
          errors.push(`${name}: Maximum 10 video reels per section for performance`);
        }
        section.videoReels.forEach((reel: IVideoReel, rIdx: number) => {
          const reelName = `${name} - Reel ${rIdx + 1}`;
          
          // Only require video if not using an oEmbed social link
          if (!reel.isOEmbed) {
            if (!reel.video) {
              errors.push(`${reelName}: Video is required`);
            } else {
              const videoUrl = typeof reel.video === "string" ? reel.video : reel.video?.url;
              if (!videoUrl || videoUrl.trim() === "") {
                errors.push(`${reelName}: Video URL is required`);
              }
            }
          }
          
          if (reel.title && reel.title.length > 100) {
            errors.push(`${reelName}: Title must be 100 characters or less`);
          }
          if (reel.subtitle && reel.subtitle.length > 200) {
            errors.push(`${reelName}: Subtitle must be 200 characters or less`);
          }
          if (reel.duration && reel.duration > 60) {
            errors.push(`${reelName}: Video duration must be 60 seconds or less`);
          }
          if (reel.redirectLink) {
            const e = validateUrl(reel.redirectLink, `${reelName} redirect link`, true);
            if (e) errors.push(e);
          }
        });
      }
    }
  });
  return errors;
};
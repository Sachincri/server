import mongoose, { Schema, model, Document } from 'mongoose';
import { IBanner, ICarouselItem, IProductItem, ISection, ISEO, IQuadItem, IQuadCard } from '../types/homeTypes';

export interface IHomePageCMS extends Document {
  seo: ISEO;
  carousel: { items: ICarouselItem[] };
  sections: ISection[];
  headerLogo?: { public_id: string; url: string };
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

/* ---------- Product Item Schema ---------- */
const ProductItemSchema = new Schema<IProductItem>(
  {
    image: {
      public_id: { type: String, required: true },
      url: { type: String, required: true },
    },
    title: { type: String, required: true },
    subtitle: { type: String, default: '' },
    redirectLink: { type: String, default: '' }, // CamelCase
  }
);

/* ---------- Banner Schema ---------- */
const BannerSchema = new Schema<IBanner>(
  {
    image: {
      public_id: { type: String, required: true },
      url: { type: String, required: true },
    },
    title: { type: String, default: '' },
    redirectLink: { type: String, default: '' }, // CamelCase
  }
);

/* ---------- Carousel Item Schema ---------- */
const CarouselItemSchema = new Schema<ICarouselItem>(
  {
    image: {
      public_id: { type: String, required: true },
      url: { type: String, required: true },
    },
    title: { type: String, default: '' },
    subtitle: { type: String, default: '' },
    redirectLink: { type: String, default: '' }, // CamelCase
  }
);

const QuadItemSchema = new Schema<IQuadItem>(
  {
    image: {
      public_id: { type: String, required: true },
      url: { type: String, required: true },
    },
    title: { type: String, required: true },
    redirectLink: { type: String, default: '' },
  }
);

const QuadCardSchema = new Schema<IQuadCard>(
  {
    title: { type: String, required: true },
    items: { type: [QuadItemSchema], default: [] },
    redirectLink: { type: String, default: '' },
    redirectText: { type: String, default: '' },
  }
);

/* ---------- Section schema ---------- */
const SectionSchema = new Schema<ISection>(
  {
    order: { type: Number, required: true },
    type: {
      type: String,
      enum: ['banner1', 'banner2', 'banner3', 'products', 'quad_grid'],
      required: true,
    },
    banners: { type: [BannerSchema], default: [] },
    products: {
      type: {
        heading: { type: String, default: '' },
        items: { type: [ProductItemSchema], default: [] },
      },
      default: undefined,
    },
    quads: { type: [QuadCardSchema], default: [] },
    bgColor: { type: String, default: '' },
    bgGradient: { type: String, default: '' },
  }
);

/* ---------- Main schema ---------- */
const HomePageCMSSchema = new Schema<IHomePageCMS>(
  {
    seo: {
      title: { type: String, required: true, default: 'Home' },
      metaDescription: { type: String, default: '' },
      slug: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        default: 'home',
      },
      ogImage: { // Standardized to object for better asset management
        public_id: { type: String, default: '' },
        url: { type: String, default: '' }
      },
    },

    carousel: {
      type: {
        items: { type: [CarouselItemSchema], default: [] },
      },
      required: true,
      default: { items: [] },
    },

    sections: {
      type: [SectionSchema],
      default: [],
    },

    headerLogo: {
      public_id: { type: String, default: "" },
      url: { type: String, default: "" },
    },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

/* ---------- Pre-save middleware ---------- */
HomePageCMSSchema.pre('save', function (next) {
  if (this.sections && Array.isArray(this.sections) && this.sections.length > 0) {
    this.sections.sort((a: ISection, b: ISection) => (a.order ?? 0) - (b.order ?? 0));
  }
  next();
});

/* ---------- Export model ---------- */
export const HomePageCMS = mongoose.models.HomePageCMS
  ? (mongoose.models.HomePageCMS as mongoose.Model<IHomePageCMS>)
  : model<IHomePageCMS>('HomePageCMS', HomePageCMSSchema);

export default HomePageCMS;

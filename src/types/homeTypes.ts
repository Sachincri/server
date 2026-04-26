import { ImageLink } from "./productTypes";

export interface IProductItem {
  image: ImageLink;
  title: string;
  subtitle?: string;
  redirectLink?: string;
}

export interface IBanner {
  image: ImageLink;
  title?: string;
  redirectLink?: string;
}

export interface ICarouselItem {
  image: ImageLink;
  title?: string;
  subtitle?: string;
  redirectLink?: string;
}

export interface IVideoReel {
  video: ImageLink;
  thumbnail?: ImageLink;
  title?: string;
  subtitle?: string;
  redirectLink?: string;
  productId?: string;
  duration?: number; // seconds (max 60)
  oembedUrl?: string;
  oembedHtml?: string;
  isOEmbed?: boolean;
}

export type SectionType = 'banner1' | 'banner2' | 'banner3' | 'products' | 'quad_grid' | 'single_product_carousel' | 'video_reels';

export interface IQuadItem {
  image: ImageLink;
  title: string;
  redirectLink: string;
}

export interface IQuadCard {
  title: string;
  items: IQuadItem[];
  redirectLink: string;
  redirectText: string;
  layout?: 'grid' | 'single' | 'carousel';
}

export interface IProductsSection {
  heading?: string;
  items?: IProductItem[];
}

export interface ISection {
  order: number;
  type: SectionType;
  banners?: IBanner[];
  products?: IProductsSection;
  quads?: IQuadCard[];
  videoReels?: IVideoReel[];
  bgColor?: string;
  bgGradient?: string;
  mobileColumns?: 1 | 2;
  _id?: string;
}

export interface ISEO {
  title: string;
  metaDescription?: string;
  slug: string;
  ogImage?: ImageLink;
}

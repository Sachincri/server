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

export type SectionType = 'banner1' | 'banner2' | 'banner3' | 'products' | 'quad_grid';

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
  bgColor?: string;
  bgGradient?: string;
  _id?: string;
}

export interface ISEO {
  title: string;
  metaDescription?: string;
  slug: string;
  ogImage?: ImageLink;
}

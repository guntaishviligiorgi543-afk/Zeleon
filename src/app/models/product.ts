export interface Product {
  id: string | number;
  name: string;
  slug: string;
  price: number;
  currency: string;
  category: string;
  categoryName: string;
  productType?: string;
  productTypeName?: string;
  image: string;
  description?: string;
  regularPrice?: number;
  stock?: number;
  onSale?: boolean;
}

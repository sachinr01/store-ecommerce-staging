// Server-side (SSR/SSG): call admin directly
// Client-side (browser): go through Next.js rewrite proxy to avoid CORS
const API_BASE =
  typeof window === 'undefined'
    ? (() => {
        const raw = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3000/store/api').replace(/\/+$/, '');
        // Normalise: ensure it ends with /store/api
        return raw.endsWith('/store/api') ? raw : `${raw.replace(/\/store\/api$/, '')}/store/api`;
      })()
    : '/store/api';

export interface Product {
  ID: number;
  title: string;
  slug: string;
  short_description: string;
  menu_order: number;
  price_min: number | null;
  price_max: number | null;
  _regular_price: string | null;
  _sale_price: string | null;
  _sale_price_dates_from: string | null;
  _sale_price_dates_to: string | null;
  thumbnail_id: string | null;
  thumbnail_url: string | null;
  gallery_ids: string | null;
  sku: string | null;
  stock_status: string | null;
  stock_qty: string | null;
  total_sales: number | null;
  date_added: string;
  color_slugs: string | null;
  material_slugs: string | null;
  style_slugs: string | null;
  occasion_slugs: string | null;
  feature_slugs: string | null;
  size_slugs: string | null;
  category_slug?: string | null;
  category_name?: string | null;
}

export interface Variation {
  ID: number;
  title: string;
  price: string;
  regular_price: string;
  sale_price: string | null;
  color: string | null;
  size: string | null;
  stock_status: string;
  stock_qty: string | null;
  thumbnail_id: string | null;
  thumbnail_url: string | null;
  image_urls: string[];
  sku: string | null;
  variation_description: string | null;
}

// thumbnail_url from DB is a relative path e.g. "products/abc.jpg"
// In the browser it goes through the Next.js /uploads proxy -> Express static
// On the server (SSR) it hits Express directly
const UPLOADS_ORIGIN =
  typeof window === 'undefined'
    ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/store/api').replace('/store/api', '')
    : '';

export function getImageUrl(filePath: string | null | undefined, placeholder = '/store/images/dummy.jpg'): string {
  if (!filePath) return placeholder;
  // Already a full URL — use as-is
  if (filePath.startsWith('http')) return filePath;
  // Absolute path — use as-is
  if (filePath.startsWith('/')) return filePath;
  // media_path format: "uploads/products/file.jpg" — prepend /
  if (filePath.startsWith('uploads/')) return `${UPLOADS_ORIGIN}/${filePath}`;
  // _wp_attached_file format: "products/file.jpg" — prepend /uploads/
  return `${UPLOADS_ORIGIN}/uploads/${filePath}`;
}

export interface Attribute {
  attr_id: number;
  attr_name: string;
  attr_slug: string;
  in_stock: number;
}

export interface GalleryImage {
  file_path: string;
  is_thumbnail: boolean;
}

export interface ProductDetail extends Product {
  description: string;
  price: string | null;
  regular_price: string | null;
  sale_price: string | null;
  sale_price_dates_from: string | null;
  sale_price_dates_to: string | null;
  product_features: string | null;
  product_material: string | null;
  product_collection: string | null;
  product_care: string | null;
  product_included: string | null;
  product_more_info: string | null;
  // SEO fields — dynamically stored in tbl_productmeta by admin
  // ORDER BY meta_id DESC ensures the latest saved value is always returned
  seo_meta_title:       string | null;
  seo_meta_description: string | null;
  seo_canonical_tag:    string | null;
  seo_meta_index:       string | null; // 'yes' | 'no'  (default: 'yes')
  avg_rating: number | null;
  review_count: number | null;
  gallery_urls: GalleryImage[];
  variations: Variation[];
  attributes: {
    colors: Attribute[];
    sizes: Attribute[];
  };
}

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  role: string;
  userType: number;
}

export interface AuthUserResponse {
  user: AuthUser;
}

async function apiFetch<T>(path: string, withCredentials = false): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    ...(withCredentials ? { credentials: 'include' } : {}),
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'API returned failure');
  return json.data as T;
}

async function apiPost<T>(path: string, body: object): Promise<{ success: boolean; message: string; data?: T }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    cache: 'no-store',
    credentials: 'include',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function apiPut<T>(path: string, body: object): Promise<{ success: boolean; message: string; data?: T; errors?: Record<string, string> }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    cache: 'no-store',
    credentials: 'include',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export interface AttributeOption {
  attr_id: number;
  attr_name: string;
  attr_slug: string;
}

export interface AttributeGroup {
  taxonomy: string;   // e.g. "pa_color"
  label: string;      // e.g. "Color"
  options: AttributeOption[];
}

export type ColorAttribute = AttributeOption;

export const getProducts    = (searchParams?: URLSearchParams) => {
  const qs = searchParams ? `?${searchParams.toString()}` : '';
  return apiFetch<Product[]>(`/products${qs}`);
};
export const getFeatured    = (n = 4)   => apiFetch<Product[]>(`/products/featured?limit=${n}`);
export const getOnSale      = (n?: number) => apiFetch<Product[]>(`/products/on-sale${n ? `?limit=${n}` : ''}`);
export const getBestSellers = (n = 5)   => apiFetch<Product[]>(`/products/best-sellers?limit=${n}`);
export const getProductById  = (id: number | string) => apiFetch<ProductDetail>(`/products/${id}`);
export const getProductBySlug = (slug: string) => apiFetch<ProductDetail>(`/products/slug/${slug}`);
export const getColors      = ()        => apiFetch<ColorAttribute[]>('/attributes/colors');
export const getAllAttributeGroups = () => apiFetch<AttributeGroup[]>('/attributes/all');
export const getAttributeOptions = (taxonomy: string) =>
  apiFetch<AttributeOption[]>(`/attributes/${taxonomy}`);

export interface ProductCategory {
  category_id: number;
  parent_id: number;
  category_slug: string;
  category_name: string;
  category_desc: string;
}

export const getProductCategories = () => apiFetch<ProductCategory[]>('/product-categories');
export const getCategoryChildren = (slug: string) => apiFetch<ProductCategory[]>(`/product-categories/${slug}/children`);
export const getCategoryProducts = (slug: string) => apiFetch<Product[]>(`/product-categories/${slug}/products`);

export const authLogin    = (username: string, password: string) =>
  apiPost<AuthUserResponse>('/auth/login', { username, password });

export const authGoogleLogin = (credential: string) =>
  apiPost<AuthUserResponse>('/auth/google', { credential });

export const authRegister = (username: string, email: string, password: string) =>
  apiPost<{ userId: number }>('/auth/register', { username, email, password });

export const authForgotPassword = (identifier: string) =>
  apiPost('/auth/forgot-password', { identifier });

export const authResetPassword = (token: string, password: string, confirmPassword: string) =>
  apiPost('/auth/reset-password', { token, password, confirmPassword });

export const updateProfile = (body: {
  displayName: string;
  email: string;
  firstName?: string;
  lastName?: string;
  currentPassword?: string;
  newPassword?: string;
}) => apiPut<AuthUser>('/auth/profile', body);

export interface OrderSummary {
  order_id: number;
  order_status: string;
  order_date: string;
  total: string | number | null;
  items: string | null;
}

export const getMyOrders = () => apiFetch<OrderSummary[]>('/orders/my', true);

export interface OrderItemDetail {
  order_item_id: number;
  order_item_name: string;
  product_id: number;
  variation_id: string | null;
  qty: string | number | null;
  line_total: string | number | null;
  color: string | null;
  size: string | null;
  thumbnail_url: string | null;
}

export interface OrderDetailResponse {
  order: {
    order_id: number;
    order_status: string;
    order_date: string;
    total: string | number | null;
    subtotal: string | number | null;
    shipping: string | number | null;
    payment_method: string | null;
    coupon_code: string | null;
    coupon_discount: string | number | null;
    billing_email?: string | null;
    billing_first_name?: string | null;
    billing_last_name?: string | null;
    billing_phone?: string | null;
    billing_address_1?: string | null;
    billing_address_2?: string | null;
    billing_city?: string | null;
    billing_state?: string | null;
    billing_postcode?: string | null;
    billing_country?: string | null;
    ship_first_name?: string | null;
    ship_last_name?: string | null;
    ship_phone?: string | null;
    ship_address_1?: string | null;
    ship_address_2?: string | null;
    ship_city?: string | null;
    ship_state?: string | null;
    ship_postcode?: string | null;
    ship_country?: string | null;
    user_display_name?: string | null;
    user_email?: string | null;
  };
  items: OrderItemDetail[];
}

export const getMyOrderById = (orderId: number | string) =>
  apiFetch<OrderDetailResponse>(`/orders/${orderId}`, true);

export interface RecentOrderAddress {
  address_id: number;
  order_id: number;
  address_billing: 'yes' | 'no';
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state_name: string | null;
  zipcode: string | null;
}

export const getRecentOrderAddresses = () =>
  apiFetch<RecentOrderAddress[]>('/address/recent', true);

export interface ProfileAddressForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  postcode: string;
}

export interface ProfileAddressesResponse {
  billing: ProfileAddressForm;
  shipping: ProfileAddressForm;
}

export const getProfileAddresses = () =>
  apiFetch<ProfileAddressesResponse>('/address/profile', true);

export const updateProfileAddress = (kind: 'billing' | 'shipping', body: ProfileAddressForm) =>
  apiPut<ProfileAddressesResponse>(`/address/profile/${kind}`, body);

// ── Coupons ───────────────────────────────────────────────────────────────────
export interface AppliedCoupon {
  code: string;
  type: 'percent' | 'fixed_cart';
  amount: number;
  discount: number;
  /** Subtotal of only the category-eligible items. Undefined = full cart is eligible. */
  eligibleSubtotal?: number;
}

export const getActiveCoupon = async (): Promise<AppliedCoupon | null> => {
  const res = await fetch(`${API_BASE}/coupon/active`, { credentials: 'include', cache: 'no-store' });
  const json = await res.json();
  return json.coupon ?? null;
};

export const applyCoupon = (coupon_code: string) =>
  apiPost<AppliedCoupon>('/coupon/apply', { coupon_code });

export const removeCoupon = () =>
  apiPost<null>('/coupon/remove', {});

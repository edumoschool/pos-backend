# POS System — Expo React Native Integration Guide

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [App Flow](#app-flow)
- [Getting Started](#getting-started)
- [API Client Setup](#api-client-setup)
- [Authentication](#authentication)
- [Screen-by-Screen Integration](#screen-by-screen-integration)
- [API Reference](#api-reference)
- [Role-Based Access](#role-based-access)
- [Error Handling](#error-handling)
- [Push Notifications](#push-notifications)
- [Offline Support Strategy](#offline-support-strategy)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                 Expo React Native App                │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐ │
│  │  Screens │  │  Stores  │  │  API Client (Axios) │ │
│  └──────────┘  └──────────┘  └────────────────────┘ │
└──────────────────────┬───────────────────────────────┘
                       │ HTTPS (Bearer JWT)
┌──────────────────────▼───────────────────────────────┐
│               NestJS POS Backend                     │
│  Port: 7000 │ Swagger: /api/docs                     │
│  ┌────────┐ ┌────────────┐ ┌──────────┐ ┌─────────┐ │
│  │  Auth  │ │ Resources  │ │ Reports  │ │ Guards  │ │
│  │  JWT   │ │ CRUD APIs  │ │ Analytics│ │Throttle │ │
│  └────────┘ └────────────┘ └──────────┘ └─────────┘ │
└──────────────────────┬───────────────────────────────┘
                       │
              ┌────────▼────────┐
              │   PostgreSQL    │
              │   (Supabase)    │
              └─────────────────┘
```

**Multi-tenant**: Every user belongs to a tenant. The JWT carries `tenantId`, so all data is automatically scoped.

**Roles**: `super_admin` (platform admin), `owner` (business owner), `seller` (cashier/salesperson).

---

## App Flow

### 1. Authentication Flow

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│  Splash /   │────▶│  Login      │────▶│  Dashboard   │
│  Onboarding │     │  Screen     │     │  (by role)   │
└─────────────┘     └──────┬──────┘     └──────────────┘
                           │
                    ┌──────▼──────┐
                    │  Register   │
                    │  Screen     │
                    └─────────────┘
```

- **First launch** → Onboarding slides → Register (creates tenant + owner user)
- **Returning user** → Login screen → JWT stored in SecureStore → Dashboard
- **Token expired** → Intercept 401 → Redirect to Login

### 2. Owner Flow

```
Dashboard
  ├── Branches       → CRUD branches
  ├── Users/Staff    → Create sellers, assign to branches
  ├── Catalog
  │   ├── Categories → CRUD
  │   ├── Products   → CRUD with barcode/SKU
  │   └── Units      → CRUD (kg, pcs, etc.)
  ├── Inventory      → Stock per branch, low-stock alerts
  ├── POS (Sell)     → Create sales with items
  ├── Clients        → CRUD customer database
  ├── Payments       → Record payments for sales
  ├── Debts          → Unpaid sales, client balances, aging
  ├── Expenses
  │   ├── Categories → Expense category management
  │   └── Transactions → Record income/expenses
  └── Reports
      ├── Sales Summary
      ├── Sales by Day
      ├── Top Products
      ├── Top Sellers
      ├── Inventory Report
      ├── Financial Summary
      └── Expenses by Category
```

### 3. Seller Flow

```
Dashboard
  ├── POS (Sell)     → Create sales, scan barcodes
  ├── Clients        → View/add clients
  ├── Payments       → Record payments
  └── Products       → Browse catalog (read-only)
```

### 4. POS Sale Flow (Core Feature)

```
┌────────┐    ┌──────────┐    ┌───────────┐    ┌──────────┐    ┌─────────┐
│Search/ │───▶│ Add to   │───▶│ Review    │───▶│ Payment  │───▶│ Receipt │
│Scan    │    │ Cart     │    │ Cart      │    │ Screen   │    │ Screen  │
│Product │    │          │    │ +Discount │    │ Method   │    │         │
└────────┘    └──────────┘    └───────────┘    └──────────┘    └─────────┘
```

1. **Search/Scan**: `GET /products?search=` or scan barcode
2. **Build cart**: Client-side array of `{ productId, quantity, unitPrice }`
3. **Apply discount**: Set `discountAmount` field
4. **Select client** (optional): `GET /clients?search=`
5. **Choose payment method**: cash / card / transfer / other
6. **Submit**: `POST /sales` with all items in one request
7. **Show receipt**: Display returned sale data with items

---

## Getting Started

### Prerequisites

```bash
npx create-expo-app pos-app --template blank-typescript
cd pos-app
npx expo install expo-secure-store axios
npx expo install @react-navigation/native @react-navigation/native-stack
npx expo install react-native-screens react-native-safe-area-context
```

### Environment Config

Create `config.ts`:

```typescript
export const API_URL = __DEV__
  ? 'http://192.168.x.x:7000'  // Your local IP
  : 'https://your-production-api.com';
```

---

## API Client Setup

### `api/client.ts`

```typescript
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from '../config';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT to every request
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync('access_token');
      // Navigate to login - use your navigation ref
    }
    return Promise.reject(error);
  },
);

export default api;
```

---

## Authentication

### `api/auth.ts`

```typescript
import api from './client';
import * as SecureStore from 'expo-secure-store';

export interface LoginPayload {
  phone: string;
  password: string;
}

export interface RegisterPayload {
  phone: string;
  password: string;       // min 6 chars
  fullName: string;
  tenantName: string;
  language?: 'en' | 'uz' | 'ru';
}

export interface AuthResponse {
  access_token: string;
  user: {
    id: string;
    phone: string;
    fullName: string;
    role: 'super_admin' | 'owner' | 'seller';
    tenantId: string;
    branchId: string | null;
  };
}

export const authApi = {
  // Register creates a new tenant + owner user
  register: async (data: RegisterPayload): Promise<AuthResponse> => {
    const res = await api.post('/auth/register', data);
    await SecureStore.setItemAsync('access_token', res.data.access_token);
    return res.data;
  },

  login: async (data: LoginPayload): Promise<AuthResponse> => {
    const res = await api.post('/auth/login', data);
    await SecureStore.setItemAsync('access_token', res.data.access_token);
    return res.data;
  },

  getProfile: async () => {
    const res = await api.get('/auth/profile');
    return res.data;
  },

  logout: async () => {
    try { await api.post('/auth/logout'); } catch {}
    await SecureStore.deleteItemAsync('access_token');
  },

  // Get all active sessions (each has isCurrent flag)
  getSessions: async () => {
    const res = await api.get('/auth/sessions');
    return res.data;
    // → [{ id, ipAddress, userAgent, createdAt, expiresAt, isCurrent: true/false }]
  },

  // Revoke a specific session
  revokeSession: async (sessionId: string) => {
    const res = await api.delete(`/auth/sessions/${sessionId}`);
    return res.data;
  },

  // Revoke all sessions
  logoutAll: async () => {
    const res = await api.post('/auth/logout-all');
    await SecureStore.deleteItemAsync('access_token');
    return res.data;
  },
};
```

### JWT Payload Shape

The JWT token contains these claims (decoded):

```typescript
interface JwtPayload {
  sub: string;           // User ID (used as sellerId in sales)
  phone: string;
  role: 'super_admin' | 'owner' | 'seller';
  tenantId: string | null;
  branchId: string | null;
}
```

The backend automatically extracts `tenantId` and `sub` (userId) from the token — you never need to send these yourself.

---

## Screen-by-Screen Integration

### Login Screen

```typescript
const handleLogin = async () => {
  try {
    const result = await authApi.login({ phone, password });
    // Navigate based on role
    if (result.user.role === 'owner') navigation.replace('OwnerDashboard');
    else navigation.replace('SellerDashboard');
  } catch (err) {
    // Show error: "Invalid phone or password"
  }
};
```

### Register Screen

```typescript
const handleRegister = async () => {
  try {
    const result = await authApi.register({
      phone,
      password,
      fullName,
      tenantName: businessName,
      language: 'en',
    });
    navigation.replace('OwnerDashboard');
  } catch (err) {
    // Show error
  }
};
```

### Products Screen

```typescript
import api from '../api/client';

// List products (with optional search)
const fetchProducts = async (search?: string) => {
  const params = search ? { search } : {};
  const res = await api.get('/products', { params });
  return res.data;  // Array of products with category, unit, inventory
};

// Create product (with optional image)
const createProduct = async (product: {
  name: string;
  categoryId?: string;
  unitId?: string;
  sku?: string;
  barcode?: string;
  costPrice?: number;
  sellingPrice?: number;
  quantity?: number;
  minQuantity?: number;
}, image?: { uri: string; name: string; type: string }) => {
  const formData = new FormData();
  Object.entries(product).forEach(([key, value]) => {
    if (value !== undefined) formData.append(key, String(value));
  });
  if (image) {
    formData.append('image', {
      uri: image.uri,
      name: image.name,
      type: image.type,
    } as any);
  }
  const res = await api.post('/products', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};

// Update product
const updateProduct = async (id: string, data: Partial<typeof product>) => {
  const res = await api.patch(`/products/${id}`, data);
  return res.data;
};

// Upload / replace product image
const uploadProductImage = async (id: string, image: { uri: string; name: string; type: string }) => {
  const formData = new FormData();
  formData.append('file', {
    uri: image.uri,
    name: image.name,
    type: image.type,
  } as any);
  const res = await api.post(`/products/${id}/image`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};

// Delete product image
const deleteProductImage = async (id: string) => {
  await api.delete(`/products/${id}/image`);
};

// Deactivate product
const deleteProduct = async (id: string) => {
  await api.delete(`/products/${id}`);
};
```

### POS / New Sale Screen

```typescript
// Cart state (client-side)
interface CartItem {
  productId: string;
  name: string;       // For display only
  quantity: number;
  unitPrice: number;
}

const [cart, setCart] = useState<CartItem[]>([]);
const [clientId, setClientId] = useState<string | undefined>();
const [discount, setDiscount] = useState(0);
const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer' | 'other'>('cash');

// Add product to cart (from search or barcode scan)
const addToCart = (product: Product) => {
  setCart((prev) => {
    const existing = prev.find((i) => i.productId === product.id);
    if (existing) {
      return prev.map((i) =>
        i.productId === product.id
          ? { ...i, quantity: i.quantity + 1 }
          : i,
      );
    }
    return [...prev, {
      productId: product.id,
      name: product.name,
      quantity: 1,
      unitPrice: Number(product.sellingPrice),
    }];
  });
};

// Calculate totals
const totalAmount = cart.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
const finalAmount = totalAmount - discount;

// Submit sale
const submitSale = async (paidAmount: number) => {
  const res = await api.post('/sales', {
    branchId: userBranchId, // From auth context
    clientId,
    discountAmount: discount,
    paidAmount,
    paymentMethod,
    items: cart.map(({ productId, quantity, unitPrice }) => ({
      productId,
      quantity,
      unitPrice,
    })),
  });
  return res.data; // Sale with items, seller, client info
};

// Update sale (e.g. edit items, change client, adjust discount)
const updateSale = async (saleId: string) => {
  const res = await api.patch(`/sales/${saleId}`, {
    clientId,
    discountAmount: discount,
    notes: 'Updated by cashier',
    // Pass items to replace all sale items (inventory auto-adjusted)
    items: cart.map(({ productId, quantity, unitPrice }) => ({
      productId,
      quantity,
      unitPrice,
    })),
  });
  return res.data;
};

// Delete sale (restores inventory, cascade-deletes items & payments)
const deleteSale = async (saleId: string) => {
  await api.delete(`/sales/${saleId}`);
};
```

### Payments Screen

```typescript
// Add payment to an existing sale (partial payments)
const addPayment = async (saleId: string, amount: number, method = 'cash') => {
  const res = await api.post('/payments', {
    saleId,
    amount,
    paymentMethod: method,
  });
  return res.data;
};

// List payments (optionally filter by sale)
const fetchPayments = async (saleId?: string) => {
  const params = saleId ? { saleId } : {};
  const res = await api.get('/payments', { params });
  return res.data;
};
```

### Inventory Screen

```typescript
// Get inventory for a branch
const fetchInventory = async (branchId: string) => {
  const res = await api.get('/inventory', { params: { branchId } });
  return res.data;
};

// Low stock alerts
const fetchLowStock = async (branchId: string) => {
  const res = await api.get('/inventory/low-stock', { params: { branchId } });
  return res.data;
};

// Update stock quantity
const updateStock = async (inventoryId: string, quantity: number) => {
  const res = await api.patch(`/inventory/${inventoryId}`, { quantity });
  return res.data;
};
```

### Debts Screen (Owner)

```typescript
const debtsApi = {
  // All unpaid/partially paid sales
  list: (branchId?: string, clientId?: string) =>
    api.get('/debts', { params: { branchId, clientId } }),

  // Debt summary with aging breakdown
  summary: (branchId?: string) =>
    api.get('/debts/summary', { params: { branchId } }),

  // Per-client debt balances (sorted by highest debt)
  clientBalances: () =>
    api.get('/debts/clients'),

  // Single client debt detail with unpaid sales & payments
  clientDebt: (clientId: string) =>
    api.get(`/debts/clients/${clientId}`),
};

// Example: Show debt summary
const summary = await debtsApi.summary();
// → { totalDebt, totalSales, pendingCount, partialCount,
//    aging: { current, '31-60', '61-90', '90+' } }

// Example: List clients ranked by debt
const clients = await debtsApi.clientBalances();
// → [{ id, fullName, phone, totalDebt, unpaidSalesCount, oldestDebtDate, oldestDebtDays }]

// Example: Pay off a debt (uses existing payments endpoint)
await api.post('/payments', { saleId, amount: 500, paymentMethod: 'cash' });
```

### Reports Screen (Owner only)

```typescript
const reportsApi = {
  salesSummary: (branchId?: string, from?: string, to?: string) =>
    api.get('/reports/sales-summary', { params: { branchId, from, to } }),

  salesByDay: (branchId?: string, from?: string, to?: string) =>
    api.get('/reports/sales-by-day', { params: { branchId, from, to } }),

  topProducts: (branchId?: string, limit = 10) =>
    api.get('/reports/top-products', { params: { branchId, limit } }),

  topSellers: (branchId?: string, from?: string, to?: string) =>
    api.get('/reports/top-sellers', { params: { branchId, from, to } }),

  inventory: (branchId?: string) =>
    api.get('/reports/inventory', { params: { branchId } }),

  financialSummary: (branchId?: string, from?: string, to?: string) =>
    api.get('/reports/financial-summary', { params: { branchId, from, to } }),

  expensesByCategory: (branchId?: string, from?: string, to?: string) =>
    api.get('/reports/expenses-by-category', { params: { branchId, from, to } }),
};

// Example: Sales summary for current month
const today = new Date();
const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
const summary = await reportsApi.salesSummary(branchId, firstOfMonth);
// → { totalSales, totalAmount, totalPaid, totalDiscount, totalOutstanding }
```

---

## API Reference

### Authentication (Public)

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| `POST` | `/auth/register` | `{ phone, password, fullName, tenantName, language? }` | Register owner + tenant |
| `POST` | `/auth/login` | `{ phone, password }` | Login, returns JWT |
| `GET` | `/auth/profile` | — | Get current user profile |
| `POST` | `/auth/logout` | — | Logout current session |
| `POST` | `/auth/logout-all` | — | Revoke all sessions |
| `GET` | `/auth/sessions` | — | List active sessions (with `isCurrent` flag) |
| `DELETE` | `/auth/sessions/:id` | — | Revoke a specific session |

### Branches

| Method | Endpoint | Body/Query | Roles |
|--------|----------|------------|-------|
| `POST` | `/branches` | `{ name, address?, phone? }` | owner, super_admin |
| `GET` | `/branches` | — | all |
| `GET` | `/branches/:id` | — | all |
| `PATCH` | `/branches/:id` | `{ name?, address?, phone?, isActive? }` | owner, super_admin |
| `DELETE` | `/branches/:id` | — | owner, super_admin |

### Users / Staff

| Method | Endpoint | Body | Roles |
|--------|----------|------|-------|
| `POST` | `/users` | `{ phone, password, fullName, role?, branchId?, language? }` | owner, super_admin |
| `GET` | `/users` | — | owner, super_admin |
| `GET` | `/users/:id` | — | owner, super_admin |
| `PATCH` | `/users/:id` | `{ fullName?, password?, role?, branchId?, language?, isActive? }` | owner, super_admin |
| `DELETE` | `/users/:id` | — | owner, super_admin |

### Categories

| Method | Endpoint | Body |
|--------|----------|------|
| `POST` | `/categories` | `{ name, description? }` |
| `GET` | `/categories` | — |
| `GET` | `/categories/:id` | — |
| `PATCH` | `/categories/:id` | `{ name?, description? }` |
| `DELETE` | `/categories/:id` | — |

### Units

| Method | Endpoint | Body |
|--------|----------|------|
| `POST` | `/units` | `{ name, shortName }` |
| `GET` | `/units` | — |
| `GET` | `/units/:id` | — |
| `PATCH` | `/units/:id` | `{ name?, shortName? }` |
| `DELETE` | `/units/:id` | — |

### Products

| Method | Endpoint | Body/Query |
|--------|----------|------------|
| `POST` | `/products` | `multipart/form-data: { name, categoryId?, unitId?, sku?, barcode?, costPrice?, sellingPrice?, quantity?, minQuantity?, image? }` |
| `GET` | `/products?search=` | Query: `search` (matches name, SKU, barcode) |
| `GET` | `/products/:id` | — |
| `PATCH` | `/products/:id` | `{ name?, categoryId?, ... }` |
| `POST` | `/products/:id/image` | `multipart/form-data: { file }` (max 50MB, jpeg/png/webp/gif) |
| `DELETE` | `/products/:id/image` | — (removes image from storage) |
| `DELETE` | `/products/:id` | — (deactivates) |

### Inventory

| Method | Endpoint | Body/Query |
|--------|----------|------------|
| `POST` | `/inventory` | `{ productId, branchId, quantity?, minQuantity? }` |
| `GET` | `/inventory?branchId=` | Query: `branchId` (required) |
| `GET` | `/inventory/low-stock?branchId=` | Query: `branchId` (required) |
| `GET` | `/inventory/:id` | — |
| `PATCH` | `/inventory/:id` | `{ quantity?, minQuantity? }` |
| `DELETE` | `/inventory/:id` | — |

### Clients

| Method | Endpoint | Body/Query |
|--------|----------|------------|
| `POST` | `/clients` | `{ fullName, phone?, address?, notes? }` |
| `GET` | `/clients?search=` | Query: `search` (matches name, phone) |
| `GET` | `/clients/:id` | — |
| `PATCH` | `/clients/:id` | `{ fullName?, phone?, address?, notes? }` |
| `DELETE` | `/clients/:id` | — |

### Sales

| Method | Endpoint | Body/Query |
|--------|----------|------------|
| `POST` | `/sales` | `{ branchId, clientId?, discountAmount?, paidAmount?, paymentMethod?, notes?, items: [{ productId, quantity, unitPrice }] }` |
| `GET` | `/sales?branchId=` | Query: `branchId` (optional) |
| `GET` | `/sales/:id` | — |
| `PATCH` | `/sales/:id` | `{ clientId?, discountAmount?, paymentStatus?, notes?, items?: [{ productId, quantity, unitPrice }] }` |
| `DELETE` | `/sales/:id` | — |

> **Note:** `POST /sales` automatically: creates sale + items, creates payment if `paidAmount > 0`, deducts inventory. The seller is auto-set from JWT.
>
> `PATCH /sales/:id` — When `items` are provided, old items are removed with inventory restored, then new items are created and inventory deducted. `paymentStatus` is auto-recalculated if not explicitly set.
>
> `DELETE /sales/:id` — Deletes the sale, its items, and associated payments (cascade). Inventory is restored for all items.

### Payments

| Method | Endpoint | Body/Query |
|--------|----------|------------|
| `POST` | `/payments` | `{ saleId, amount, paymentMethod?, notes? }` |
| `GET` | `/payments?saleId=` | Query: `saleId` (optional) |
| `GET` | `/payments/:id` | — |

> **Note:** `POST /payments` auto-updates the sale's `paidAmount` and `paymentStatus` (pending → partial → paid).

### Expense Categories

| Method | Endpoint | Body |
|--------|----------|------|
| `POST` | `/expense-categories` | `{ name }` |
| `GET` | `/expense-categories` | — |
| `GET` | `/expense-categories/:id` | — |
| `PATCH` | `/expense-categories/:id` | `{ name? }` |
| `DELETE` | `/expense-categories/:id` | — |

### Transactions (Income/Expenses)

| Method | Endpoint | Body/Query | Roles |
|--------|----------|------------|-------|
| `POST` | `/transactions` | `{ branchId, type: 'income'\|'expense', amount, expenseCategoryId?, description? }` | owner, super_admin |
| `GET` | `/transactions?branchId=&type=` | Query: `branchId`, `type` (both optional) | all |
| `GET` | `/transactions/:id` | — | all |

### Debts

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| `GET` | `/debts` | `branchId?, clientId?` | All unpaid/partially paid sales with debt amount and age |
| `GET` | `/debts/summary` | `branchId?` | Aggregate debt stats with aging buckets (current, 31-60, 61-90, 90+) |
| `GET` | `/debts/clients` | — | Per-client debt ranking (sorted by highest debt) |
| `GET` | `/debts/clients/:clientId` | — | Single client debt detail with unpaid sales and payment history |

> **Note:** To pay off a debt, use `POST /payments` with the `saleId` — the sale's `paidAmount` and `paymentStatus` update automatically.

### Reports

| Method | Endpoint | Query Params | Roles |
|--------|----------|--------------|-------|
| `GET` | `/reports/sales-summary` | `branchId?, from?, to?` | owner, super_admin |
| `GET` | `/reports/sales-by-day` | `branchId?, from?, to?` | owner, super_admin |
| `GET` | `/reports/top-products` | `branchId?, limit?` | owner, super_admin |
| `GET` | `/reports/top-sellers` | `branchId?, from?, to?` | owner, super_admin |
| `GET` | `/reports/inventory` | `branchId?` | owner, super_admin |
| `GET` | `/reports/financial-summary` | `branchId?, from?, to?` | owner, super_admin |
| `GET` | `/reports/expenses-by-category` | `branchId?, from?, to?` | owner, super_admin |

### Subscription Plans (Super Admin)

| Method | Endpoint | Body | Roles |
|--------|----------|------|-------|
| `POST` | `/subscription-plans` | `{ name, price, durationDays, ... }` | super_admin |
| `GET` | `/subscription-plans` | — | all |
| `GET` | `/subscription-plans/:id` | — | all |
| `PATCH` | `/subscription-plans/:id` | `{ ...fields }` | super_admin |
| `DELETE` | `/subscription-plans/:id` | — | super_admin |

### Tenants (Super Admin)

| Method | Endpoint | Roles |
|--------|----------|-------|
| `POST` | `/tenants` | super_admin |
| `GET` | `/tenants` | super_admin |
| `GET` | `/tenants/:id` | super_admin |
| `PATCH` | `/tenants/:id` | super_admin |
| `DELETE` | `/tenants/:id` | super_admin |

---

## Role-Based Access

Use the user's role from the auth response to control UI visibility:

```typescript
// types.ts
type UserRole = 'super_admin' | 'owner' | 'seller';

// navigation
const getScreensForRole = (role: UserRole) => {
  const common = ['Products', 'Clients', 'POS', 'Payments'];

  switch (role) {
    case 'seller':
      return common;
    case 'owner':
      return [...common, 'Branches', 'Users', 'Categories', 'Units',
        'Inventory', 'Debts', 'ExpenseCategories', 'Transactions', 'Reports'];
    case 'super_admin':
      return ['Tenants', 'SubscriptionPlans', ...common, 'Branches',
        'Users', 'Categories', 'Units', 'Inventory',
        'ExpenseCategories', 'Transactions', 'Reports'];
  }
};
```

---

## Error Handling

The API returns standard HTTP error responses:

```typescript
// Common error shapes
interface ApiError {
  statusCode: number;
  message: string | string[];
  error: string;
}

// 400 - Validation errors (class-validator)
// { statusCode: 400, message: ["name must be a string", ...], error: "Bad Request" }

// 401 - Unauthorized (missing/invalid JWT)
// 403 - Forbidden (insufficient role)
// 404 - Not found
// 429 - Too Many Requests (rate limit: 60 req/min)

// Global error handler
const handleApiError = (error: any): string => {
  const data = error.response?.data;
  if (!data) return 'Network error. Check your connection.';

  if (Array.isArray(data.message)) return data.message.join('\n');
  return data.message || 'Something went wrong';
};
```

---

## Offline Support Strategy

For a POS app, offline support is critical. Recommended approach:

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  UI Layer   │────▶│  Local Queue  │────▶│  Sync Engine │
│             │     │  (AsyncStore) │     │  (on online) │
└─────────────┘     └──────────────┘     └──────────────┘
```

1. **Cache catalog data** (products, categories, units) on app start using AsyncStorage or MMKV
2. **Queue sales offline**: Store pending sales locally, sync when online
3. **Detect connectivity**: Use `@react-native-community/netinfo`
4. **Sync on reconnect**: POST queued sales/payments in order

```typescript
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Queue a sale when offline
const createSaleOfflineAware = async (saleData: CreateSalePayload) => {
  const state = await NetInfo.fetch();
  if (state.isConnected) {
    return api.post('/sales', saleData);
  }
  // Queue for later sync
  const queue = JSON.parse(await AsyncStorage.getItem('pendingSales') || '[]');
  queue.push({ ...saleData, _queuedAt: new Date().toISOString() });
  await AsyncStorage.setItem('pendingSales', JSON.stringify(queue));
};

// Sync pending sales when back online
const syncPendingSales = async () => {
  const queue = JSON.parse(await AsyncStorage.getItem('pendingSales') || '[]');
  for (const sale of queue) {
    try {
      await api.post('/sales', sale);
    } catch (err) {
      // Keep failed sales in queue, break to preserve order
      break;
    }
  }
};
```

---

## Push Notifications

The backend uses the **Expo Push Notification** service to deliver notifications to your Expo app. Each user can register their Expo push token, and the backend can send notifications to individual users or all users within a tenant.

### Prerequisites

```bash
npx expo install expo-notifications expo-device expo-constants
```

For Android, add a notification channel in `app.json`:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#ffffff"
        }
      ]
    ],
    "android": {
      "useNextNotificationsApi": true
    }
  }
}
```

### `api/notifications.ts`

```typescript
import api from './client';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Configure notification behavior (show when app is in foreground)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Get the Expo push token and register it with the backend
export const registerForPushNotifications = async (): Promise<string | null> => {
  if (!Device.isDevice) {
    console.warn('Push notifications only work on physical devices');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('Push notification permission not granted');
    return null;
  }

  // Create Android notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = tokenData.data;

  // Register the token with the backend
  await api.post('/notifications/register-token', { token });

  return token;
};

// Remove the push token (e.g. on logout)
export const unregisterPushToken = async (): Promise<void> => {
  await api.delete('/notifications/remove-token');
};

// Send a notification to a specific user (owner/admin use)
export const sendToUser = async (
  userId: string,
  notification: { title?: string; body?: string; data?: Record<string, unknown> },
) => {
  const res = await api.post(`/notifications/send/user/${userId}`, notification);
  return res.data;
};

// Send a notification to all active users in the current tenant
export const sendToTenant = async (notification: {
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
}) => {
  const res = await api.post('/notifications/send/tenant', notification);
  return res.data;
};

// Check delivery receipts (for debugging)
export const getReceipts = async (ticketIds: string[]) => {
  const res = await api.post('/notifications/receipts', { ticketIds });
  return res.data;
};
```

### Notification Hook

Create a reusable hook for handling notifications throughout the app:

```typescript
// hooks/useNotifications.ts
import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { registerForPushNotifications } from '../api/notifications';

interface NotificationData {
  type?: string;          // e.g. 'low_stock', 'new_sale', 'debt_reminder'
  saleId?: string;
  productId?: string;
  [key: string]: unknown;
}

export const useNotifications = (
  onNotificationReceived?: (data: NotificationData) => void,
) => {
  const responseListener = useRef<Notifications.Subscription>();
  const notificationListener = useRef<Notifications.Subscription>();

  useEffect(() => {
    // Register token on mount
    registerForPushNotifications();

    // Listener for when notification is received while app is foregrounded
    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        const data = notification.request.content.data as NotificationData;
        onNotificationReceived?.(data);
      });

    // Listener for when user taps on a notification
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as NotificationData;
        // Navigate based on notification type
        handleNotificationNavigation(data);
      });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);
};

// Navigate to the relevant screen when a notification is tapped
const handleNotificationNavigation = (data: NotificationData) => {
  switch (data.type) {
    case 'low_stock':
      // Navigate to inventory screen
      break;
    case 'new_sale':
      // Navigate to sale detail
      break;
    case 'debt_reminder':
      // Navigate to debts screen
      break;
  }
};
```

### Usage in App Root

```typescript
// App.tsx or your root layout
import { useNotifications } from './hooks/useNotifications';
import { unregisterPushToken } from './api/notifications';

function App() {
  // Register token and listen for notifications
  useNotifications((data) => {
    console.log('Notification received in foreground:', data);
  });

  // On logout, unregister the push token
  const handleLogout = async () => {
    await unregisterPushToken();
    await authApi.logout();
  };

  // ...
}
```

### Sending Notifications (Owner Example)

```typescript
// Notify all staff about a new announcement
import { sendToTenant, sendToUser } from '../api/notifications';

// Broadcast to all tenant users
const notifyAllStaff = async () => {
  const tickets = await sendToTenant({
    title: 'New Announcement',
    body: 'Store will close early today at 6 PM',
    data: { type: 'announcement' },
  });
  // tickets: [{ status: 'ok', id: 'ticket-id' }, ...]
};

// Notify a specific seller
const notifySeller = async (sellerId: string) => {
  const tickets = await sendToUser(sellerId, {
    title: 'Low Stock Alert',
    body: 'Product "Rice 5kg" is running low (2 remaining)',
    data: { type: 'low_stock', productId: 'product-uuid' },
  });
};
```

### SendNotificationDto — Full Payload

All optional fields you can include when sending a notification:

```typescript
interface SendNotificationPayload {
  to?: string | string[];   // Auto-set when using /send/user or /send/tenant
  title?: string;           // Notification title
  body?: string;            // Notification body text
  subtitle?: string;        // iOS subtitle
  data?: Record<string, unknown>; // Custom data payload
  priority?: 'default' | 'normal' | 'high';
  ttl?: number;             // Time to live in seconds
  sound?: string | null;    // Sound file (default: 'default')
  badge?: number;           // iOS badge count
  channelId?: string;       // Android notification channel ID
  categoryId?: string;      // Notification category for actions
  mutableContent?: boolean; // iOS mutable-content flag
}
```

### Notifications API Reference

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| `POST` | `/notifications/register-token` | `{ token }` | Register Expo push token for current user |
| `DELETE` | `/notifications/remove-token` | — | Remove push token for current user |
| `POST` | `/notifications/send` | `SendNotificationDto` | Send to specific token(s) |
| `POST` | `/notifications/send/user/:userId` | `SendNotificationDto` | Send to a user by their ID |
| `POST` | `/notifications/send/tenant` | `SendNotificationDto` | Send to all active users in current tenant |
| `POST` | `/notifications/receipts` | `{ ticketIds: string[] }` | Check delivery receipts |

### Environment Variable

Add `EXPO_ACCESS_TOKEN` to your backend `.env` for authenticated Expo push API access:

```env
EXPO_ACCESS_TOKEN=your-expo-access-token
```

Generate this token at [expo.dev/accounts/[account]/settings/access-tokens](https://expo.dev/accounts/).

---

## Recommended Expo Libraries

| Purpose | Library |
|---------|---------|
| HTTP client | `axios` |
| Secure token storage | `expo-secure-store` |
| Navigation | `@react-navigation/native` + `native-stack` |
| State management | `zustand` or `@tanstack/react-query` |
| Barcode scanner | `expo-camera` (with barcode scanning) |
| Offline storage | `@react-native-async-storage/async-storage` or `react-native-mmkv` |
| Network detection | `@react-native-community/netinfo` |
| Charts (reports) | `react-native-chart-kit` or `victory-native` |
| Date picker (reports) | `react-native-date-picker` or `@react-native-community/datetimepicker` |
| Toast/alerts | `react-native-toast-message` |
| Forms | `react-hook-form` + `zod` |
| Push notifications | `expo-notifications` + `expo-device` + `expo-constants` |
| Receipt printing | `react-native-esc-pos-printer` or `expo-print` |

---

## Swagger Documentation

Interactive API docs are available when the backend is running:

```
http://localhost:7000/api/docs
```

Use the **Authorize** button with your JWT token to test endpoints directly from the browser.

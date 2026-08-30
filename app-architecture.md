# Business Management App — NestJS Backend Specification

## 1. Project Overview

Build a multi-tenant backend for a simple business management application targeted primarily at small and medium businesses in Uzbekistan.

Primary business types:

* Lighting / bulb shops
* Carpet shops
* Furniture shops
* Other small retail/trading businesses

The application manages:

* Businesses
* Branches
* Users and staff
* Products
* Categories
* Inventory
* Customers
* Sales
* Customer debts
* Payments
* Purchases / stock additions
* Furniture/carpet orders
* Deliveries
* Expenses
* Notifications
* Dashboard statistics
* Reports
* Audit logs

The application must **not feel like a complicated ERP**.

The backend should be a **modular monolith** built with:

* NestJS
* TypeScript
* PostgreSQL
* Prisma ORM
* Redis when asynchronous/background processing is required
* JWT authentication
* REST API

Do NOT introduce microservices.

---

# 2. Core Principles

## 2.1 Simplicity

Business owners should be able to use the system without accounting knowledge.

Avoid unnecessary concepts such as:

* SKU
* Barcode
* Complex accounting
* Double-entry bookkeeping
* Manufacturing
* Complicated warehouse systems
* Complicated supplier management
* Product variants as separate database entities unless necessary

## 2.2 Transaction-Based Data

Do not store important business information only as mutable totals.

For example, do not rely only on:

```text
customer.debt = 500000
```

Instead, store transactions:

```text
SALE      +1,500,000
PAYMENT     -500,000
SALE      +2,000,000
PAYMENT    -1,000,000
```

The current balance is derived from transactions or maintained as a cached value with transactions remaining as the source of truth.

The same principle applies to inventory.

---

# 3. Multi-Tenant Architecture

The system is SaaS and must support multiple businesses.

Basic hierarchy:

```text
User
 |
 +-- Business
       |
       +-- Branch
       |
       +-- Staff
       +-- Products
       +-- Customers
       +-- Sales
       +-- Purchases
       +-- Payments
       +-- Expenses
       +-- Orders
       +-- Deliveries
```

Every business-owned entity must contain:

```text
businessId
```

Branch-specific entities should also contain:

```text
branchId
```

Never allow a user from Business A to access Business B's data.

Tenant isolation must be enforced at the service/query layer and preferably through reusable Prisma patterns.

---

# 4. Project Structure

Use the following structure:

```text
src/
├── main.ts
├── app.module.ts
│
├── config/
│   ├── configuration.ts
│   └── validation.ts
│
├── common/
│   ├── decorators/
│   ├── guards/
│   ├── interceptors/
│   ├── filters/
│   ├── pipes/
│   ├── middleware/
│   ├── constants/
│   ├── enums/
│   └── utils/
│
├── prisma/
│   ├── prisma.module.ts
│   └── prisma.service.ts
│
├── auth/
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── dto/
│   ├── guards/
│   └── strategies/
│
├── users/
│   ├── users.module.ts
│   ├── users.controller.ts
│   ├── users.service.ts
│   └── dto/
│
├── businesses/
│   ├── businesses.module.ts
│   ├── businesses.controller.ts
│   ├── businesses.service.ts
│   └── dto/
│
├── branches/
│   ├── branches.module.ts
│   ├── branches.controller.ts
│   ├── branches.service.ts
│   └── dto/
│
├── staff/
│   ├── staff.module.ts
│   ├── staff.controller.ts
│   ├── staff.service.ts
│   └── dto/
│
├── products/
│   ├── products.module.ts
│   ├── products.controller.ts
│   ├── products.service.ts
│   ├── categories/
│   └── dto/
│
├── inventory/
│   ├── inventory.module.ts
│   ├── inventory.controller.ts
│   ├── inventory.service.ts
│   └── dto/
│
├── customers/
│   ├── customers.module.ts
│   ├── customers.controller.ts
│   ├── customers.service.ts
│   └── dto/
│
├── sales/
│   ├── sales.module.ts
│   ├── sales.controller.ts
│   ├── sales.service.ts
│   ├── dto/
│   └── calculations/
│
├── payments/
│   ├── payments.module.ts
│   ├── payments.controller.ts
│   ├── payments.service.ts
│   └── dto/
│
├── debts/
│   ├── debts.module.ts
│   ├── debts.controller.ts
│   ├── debts.service.ts
│   └── dto/
│
├── purchases/
│   ├── purchases.module.ts
│   ├── purchases.controller.ts
│   ├── purchases.service.ts
│   └── dto/
│
├── orders/
│   ├── orders.module.ts
│   ├── orders.controller.ts
│   ├── orders.service.ts
│   └── dto/
│
├── deliveries/
│   ├── deliveries.module.ts
│   ├── deliveries.controller.ts
│   ├── deliveries.service.ts
│   └── dto/
│
├── expenses/
│   ├── expenses.module.ts
│   ├── expenses.controller.ts
│   ├── expenses.service.ts
│   └── dto/
│
├── notifications/
│   ├── notifications.module.ts
│   ├── notifications.controller.ts
│   ├── notifications.service.ts
│   ├── notifications.processor.ts
│   └── dto/
│
├── dashboard/
│   ├── dashboard.module.ts
│   ├── dashboard.controller.ts
│   └── dashboard.service.ts
│
├── reports/
│   ├── reports.module.ts
│   ├── reports.controller.ts
│   └── reports.service.ts
│
└── audit/
    ├── audit.module.ts
    ├── audit.service.ts
    └── audit.interceptor.ts
```

---

# 5. Database Design

Use PostgreSQL with Prisma.

Use UUIDs for primary keys.

All monetary values should use:

```text
Decimal
```

Do not use floating-point numbers for money.

Currency defaults to:

```text
UZS
```

---

# 6. Business

```text
Business
---------
id
name
businessType
currency
phone
address
logoUrl
isActive
createdAt
updatedAt
```

Business types:

```text
LIGHTING
CARPET
FURNITURE
OTHER
```

The business type is primarily used to customize the application experience.

It should NOT heavily change the underlying database architecture.

---

# 7. Branch

```text
Branch
-------
id
businessId
name
phone
address
isMain
isActive
createdAt
updatedAt
```

A business can initially have one branch.

The architecture must support multiple branches later.

---

# 8. User

```text
User
----
id
phone
email
passwordHash
firstName
lastName
avatarUrl
isActive
createdAt
updatedAt
```

Phone number should be the primary authentication method.

Email is optional.

---

# 9. Staff Membership

A user may belong to a business as staff.

```text
Staff
-----
id
businessId
userId
branchId
role
isActive
createdAt
updatedAt
```

Roles:

```text
OWNER
MANAGER
SELLER
CASHIER
WAREHOUSE
```

---

# 10. Permissions

Do not implement hundreds of permissions.

Use practical permissions.

```text
PRODUCTS_VIEW
PRODUCTS_MANAGE

SALES_VIEW
SALES_CREATE
SALES_CANCEL

CUSTOMERS_VIEW
CUSTOMERS_MANAGE

DEBTS_VIEW
DEBTS_MANAGE

INVENTORY_VIEW
INVENTORY_MANAGE

PURCHASES_VIEW
PURCHASES_CREATE

ORDERS_VIEW
ORDERS_MANAGE

DELIVERIES_VIEW
DELIVERIES_MANAGE

EXPENSES_VIEW
EXPENSES_CREATE

STAFF_VIEW
STAFF_MANAGE

REPORTS_VIEW

BUSINESS_MANAGE
```

Owner has all permissions.

Manager has most business permissions.

Seller should mainly have:

```text
SALES_VIEW
SALES_CREATE
CUSTOMERS_VIEW
CUSTOMERS_MANAGE
```

Warehouse:

```text
PRODUCTS_VIEW
INVENTORY_VIEW
INVENTORY_MANAGE
PURCHASES_VIEW
PURCHASES_CREATE
```

---

# 11. Product

Product is intentionally simple.

```text
Product
-------
id
businessId
categoryId
name
description
imageUrl
unit
purchasePrice
sellingPrice
stockQuantity
minimumStock
attributes
isActive
createdAt
updatedAt
```

Do NOT create SKU or barcode fields.

`attributes` should be JSON.

Examples:

Lighting:

```json
{
  "power": "12W",
  "color": "Warm White",
  "type": "LED"
}
```

Carpet:

```json
{
  "size": "3x4",
  "material": "Wool",
  "color": "Beige"
}
```

Furniture:

```json
{
  "material": "Velvet",
  "color": "Grey",
  "size": "2.8m"
}
```

---

# 12. Product Categories

```text
Category
--------
id
businessId
name
parentId
isActive
createdAt
updatedAt
```

Examples:

Lighting:

```text
Bulbs
Lamps
Chandeliers
LED
Accessories
```

Carpet:

```text
Persian
Modern
Classic
Runner
```

Furniture:

```text
Sofa
Bed
Table
Chair
Wardrobe
```

Categories can optionally have parents.

---

# 13. Units

Use a controlled enum.

```text
PIECE
METER
SQUARE_METER
KILOGRAM
LITER
SET
BOX
```

Do not implement complex unit conversion initially.

---

# 14. Inventory

Inventory is transaction-based.

```text
StockMovement
-------------
id
businessId
branchId
productId
type
quantity
unitCost
referenceType
referenceId
note
createdById
createdAt
```

Types:

```text
PURCHASE
SALE
RETURN
ADJUSTMENT
DAMAGE
```

Examples:

```text
PURCHASE +50
SALE -2
DAMAGE -1
ADJUSTMENT +5
RETURN +1
```

`stockQuantity` on Product can be maintained as a cached value.

Whenever stock changes:

1. Create StockMovement.
2. Update Product.stockQuantity.
3. Perform both operations inside one database transaction.

Never update stock without creating a stock movement.

---

# 15. Customer

```text
Customer
--------
id
businessId
name
phone
address
note
isActive
createdAt
updatedAt
```

Phone is optional.

A customer can have:

```text
Sales
Payments
Orders
Deliveries
```

---

# 16. Customer Transactions

Use a unified transaction ledger for customer financial activity.

```text
CustomerTransaction
-------------------
id
businessId
branchId
customerId
type
amount
saleId
paymentId
note
createdById
createdAt
```

Types:

```text
SALE
PAYMENT
RETURN
ADJUSTMENT
```

Rules:

### SALE

Customer balance increases.

### PAYMENT

Customer balance decreases.

### RETURN

Customer balance decreases.

### ADJUSTMENT

Used only by authorized staff.

The customer's debt should be calculated from these transactions.

---

# 17. Sale

```text
Sale
----
id
businessId
branchId
customerId
staffId
subtotal
discount
total
paidAmount
debtAmount
paymentStatus
status
note
createdAt
updatedAt
```

Customer can be null for a walk-in customer.

Statuses:

```text
COMPLETED
CANCELLED
```

Payment status:

```text
UNPAID
PARTIAL
PAID
```

---

# 18. Sale Item

```text
SaleItem
--------
id
saleId
productId
quantity
unitPrice
purchasePrice
discount
total
```

Store the purchase price at the moment of sale.

Do not calculate historical profit using the product's current purchase price.

---

# 19. Sale Creation Transaction

Creating a sale must happen inside a database transaction.

Process:

```text
1. Validate customer
2. Validate products
3. Validate stock
4. Calculate totals
5. Create Sale
6. Create SaleItems
7. Create StockMovements
8. Decrease product stock
9. Create customer transaction if customer has debt
10. Create payment transaction if money was received
11. Commit transaction
```

If any operation fails, rollback everything.

---

# 20. Payments

```text
Payment
-------
id
businessId
branchId
customerId
saleId
amount
method
note
createdById
createdAt
```

Methods:

```text
CASH
CARD
BANK_TRANSFER
CLICK
PAYME
OTHER
```

A payment may be connected to a sale or may be a general customer debt payment.

Example:

```text
Customer owes:
1,500,000

Payment:
500,000

Remaining:
1,000,000
```

---

# 21. Debts

Do NOT create a separate `Debt` balance as the source of truth.

Debt is calculated from customer transactions.

The API should expose:

```text
GET /customers/:id/balance
GET /debts
GET /debts/overdue
```

Response:

```json
{
  "customerId": "...",
  "totalDebt": 1200000
}
```

Debt summary should support:

```text
total debt
number of debtors
overdue debt
largest debts
```

---

# 22. Purchases

Purchases are primarily for adding stock.

```text
Purchase
--------
id
businessId
branchId
supplierName
total
note
createdById
createdAt
```

Supplier management is intentionally simple.

Do NOT build a full supplier CRM in V1.

---

# 23. Purchase Item

```text
PurchaseItem
------------
id
purchaseId
productId
quantity
unitCost
total
```

When a purchase is completed:

```text
Create Purchase
Create PurchaseItems
Create StockMovements
Increase product.stockQuantity
```

All inside one database transaction.

---

# 24. Orders

Orders are particularly important for furniture businesses.

```text
Order
-----
id
businessId
branchId
customerId
status
subtotal
discount
total
paidAmount
remainingAmount
note
expectedDate
createdById
createdAt
updatedAt
```

Statuses:

```text
NEW
PREPARING
READY
DELIVERED
CANCELLED
```

An order can contain products.

---

# 25. Order Items

```text
OrderItem
---------
id
orderId
productId
nameSnapshot
quantity
unitPrice
total
attributes
```

Store `nameSnapshot` so historical orders remain understandable even if the product name changes.

---

# 26. Deliveries

```text
Delivery
--------
id
businessId
branchId
customerId
orderId
address
deliveryDate
deliveryFee
status
note
createdById
createdAt
updatedAt
```

Statuses:

```text
PENDING
OUT_FOR_DELIVERY
DELIVERED
CANCELLED
```

The customer address should be stored on the delivery itself because the customer may change their address later.

---

# 27. Expenses

```text
Expense
-------
id
businessId
branchId
categoryId
amount
paymentMethod
description
createdById
createdAt
```

Expense categories:

```text
RENT
SALARY
DELIVERY
ELECTRICITY
INTERNET
MARKETING
TAX
OTHER
```

---

# 28. Notifications

Notifications should support both in-app notifications and push notifications.

```text
Notification
------------
id
businessId
userId
type
title
message
data
isRead
createdAt
```

Types:

```text
LOW_STOCK
OVERDUE_DEBT
PAYMENT_RECEIVED
SALE_CREATED
DELIVERY_TODAY
ORDER_READY
SYSTEM
```

The backend should generate useful notifications rather than excessive notifications.

---

# 29. Notification Preferences

```text
NotificationPreference
----------------------
id
businessId
userId
lowStock
overdueDebt
paymentReceived
deliveryReminder
orderReady
```

---

# 30. Dashboard

Dashboard must be optimized for business owners.

Endpoint:

```text
GET /dashboard
```

Support:

```text
today
this_week
this_month
custom
```

Return:

```text
sales
profit
expenses
debt
payments
lowStockProducts
recentSales
overdueDebts
upcomingDeliveries
```

Example:

```json
{
  "sales": {
    "total": 4850000,
    "count": 18
  },
  "profit": 1240000,
  "expenses": 680000,
  "debt": 2350000,
  "lowStockCount": 7,
  "overdueDebtCount": 3
}
```

---

# 31. Profit Calculation

For a sale:

```text
revenue = selling price × quantity

cost = purchase price × quantity

gross profit = revenue - cost
```

Business profit:

```text
gross profit - expenses
```

Do not call this "net profit" if other accounting obligations are not included.

Use:

```text
estimatedProfit
```

or:

```text
operatingProfit
```

where appropriate.

---

# 32. Reports

Initial reports:

```text
GET /reports/sales
GET /reports/profit
GET /reports/expenses
GET /reports/debts
GET /reports/inventory
GET /reports/staff
```

Support:

```text
today
week
month
custom date range
```

Reports should be query-based.

Do not create a complicated reporting warehouse in V1.

---

# 33. Authentication

Use:

```text
JWT access token
JWT refresh token
```

Recommended flow:

```text
POST /auth/register
POST /auth/login
POST /auth/refresh
POST /auth/logout
GET  /auth/me
```

Authentication should primarily support phone number + password.

OTP can be added later.

---

# 34. Authorization

Every authenticated request should have access to:

```text
userId
businessId
branchId
role
permissions
```

Create decorators:

```typescript
@CurrentUser()
@CurrentBusiness()
@CurrentBranch()
@Permissions(...)
```

Example:

```typescript
@Permissions('SALES_CREATE')
@Post()
createSale() {}
```

---

# 35. Tenant Isolation

Never accept `businessId` blindly from request body.

Bad:

```typescript
createProduct({
  businessId: dto.businessId
});
```

Good:

```typescript
createProduct({
  businessId: currentUser.businessId
});
```

The authenticated user's business determines the tenant.

For admin/system operations, explicit tenant switching can be implemented separately.

---

# 36. API Structure

Use REST.

Base path:

```text
/api/v1
```

Examples:

```text
POST   /api/v1/auth/login

GET    /api/v1/products
POST   /api/v1/products
GET    /api/v1/products/:id
PATCH  /api/v1/products/:id
DELETE /api/v1/products/:id

GET    /api/v1/customers
POST   /api/v1/customers
GET    /api/v1/customers/:id

GET    /api/v1/sales
POST   /api/v1/sales
GET    /api/v1/sales/:id
POST   /api/v1/sales/:id/cancel

POST   /api/v1/payments

GET    /api/v1/debts
GET    /api/v1/debts/overdue

GET    /api/v1/inventory
POST   /api/v1/inventory/adjust

GET    /api/v1/orders
POST   /api/v1/orders
PATCH  /api/v1/orders/:id/status

GET    /api/v1/deliveries
PATCH  /api/v1/deliveries/:id/status

GET    /api/v1/expenses
POST   /api/v1/expenses

GET    /api/v1/dashboard
```

---

# 37. API Response Format

Use a consistent response format.

Success:

```json
{
  "success": true,
  "data": {}
}
```

List:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Not enough stock available."
  }
}
```

---

# 38. Error Codes

Use stable machine-readable error codes.

Examples:

```text
UNAUTHORIZED
FORBIDDEN
NOT_FOUND
VALIDATION_ERROR

BUSINESS_NOT_FOUND
PRODUCT_NOT_FOUND
CUSTOMER_NOT_FOUND
SALE_NOT_FOUND

INSUFFICIENT_STOCK
SALE_ALREADY_CANCELLED
ORDER_ALREADY_DELIVERED
INVALID_PAYMENT_AMOUNT
INVALID_STATUS_TRANSITION
```

---

# 39. Pagination

All large collections must support:

```text
?page=1&limit=20
```

Search:

```text
?search=philips
```

Filtering:

```text
?categoryId=
?status=
?branchId=
?from=
?to=
```

Sorting:

```text
?sortBy=createdAt&sortOrder=desc
```

Limit maximum:

```text
100
```

---

# 40. DTO Validation

Use:

```text
class-validator
class-transformer
```

Every incoming DTO must be validated.

Do not trust client-side validation.

Examples:

```typescript
@IsString()
@IsNotEmpty()
name: string;

@IsNumber()
@Min(0)
sellingPrice: number;
```

---

# 41. Database Transactions

Use Prisma `$transaction()` for all multi-step business operations.

Required transaction operations:

### Sale

```text
Sale
SaleItems
StockMovement
Product stock
CustomerTransaction
Payment
```

### Purchase

```text
Purchase
PurchaseItems
StockMovement
Product stock
```

### Customer payment

```text
Payment
CustomerTransaction
```

### Order completion/delivery

Use a transaction whenever inventory or payment changes.

---

# 42. Cancellation Rules

Do not physically delete completed financial records.

For example:

```text
DELETE /sales/:id
```

should not delete a completed sale.

Instead:

```text
POST /sales/:id/cancel
```

Cancellation should:

1. Change sale status to CANCELLED.
2. Reverse stock movement.
3. Reverse customer transaction if applicable.
4. Reverse payment association when appropriate.
5. Create audit log.

All inside a transaction.

The same principle applies to purchases and other financial records.

---

# 43. Audit Log

Track important actions.

```text
AuditLog
--------
id
businessId
userId
action
entityType
entityId
metadata
createdAt
```

Examples:

```text
SALE_CREATED
SALE_CANCELLED
PAYMENT_CREATED
PRODUCT_CREATED
PRODUCT_UPDATED
STOCK_ADJUSTED
EXPENSE_CREATED
ORDER_STATUS_CHANGED
STAFF_CREATED
```

Do not audit every GET request.

---

# 44. Soft Delete

For business-critical entities, prefer:

```text
isActive
```

or status changes over physical deletion.

Products should normally be deactivated rather than deleted.

Customers should normally be deactivated rather than deleted.

Financial records should never be physically deleted after completion.

---

# 45. Search

The app needs fast simple search.

Products:

```text
GET /products?search=philips
```

Customers:

```text
GET /customers?search=ali
```

Use PostgreSQL indexes on commonly searched fields.

Do not introduce Elasticsearch.

---

# 46. Indexes

At minimum, create indexes for:

```text
businessId
branchId
businessId + createdAt
businessId + customerId
businessId + productId
businessId + status
businessId + isActive
```

Also add appropriate composite indexes for common dashboard/report queries.

---

# 47. Concurrency and Stock

Stock operations must be safe when multiple employees sell simultaneously.

Do not simply:

```text
read stock
subtract
save
```

because concurrent sales can produce incorrect stock.

Use a database transaction and appropriate row-level/concurrency protection.

The backend must guarantee:

```text
stock cannot become negative
```

unless the business explicitly enables negative stock.

Business setting:

```text
allowNegativeStock: false
```

Default:

```text
false
```

---

# 48. Business Settings

Add:

```text
BusinessSettings
----------------
id
businessId
allowNegativeStock
defaultCurrency
defaultPaymentMethod
lowStockNotifications
debtNotifications
```

Keep settings minimal.

---

# 49. File Storage

Product images and business logos should not be stored directly in PostgreSQL.

Store files in object storage.

The database stores:

```text
imageUrl
logoUrl
```

The exact storage provider can be configured later.

---

# 50. Background Jobs

Do not introduce Redis everywhere.

Use Redis + BullMQ only for tasks that actually benefit from background processing.

Examples:

```text
notification processing
scheduled overdue-debt checks
low-stock checks
daily summaries
push notifications
```

Normal CRUD operations should remain synchronous.

---

# 51. Scheduled Jobs

Possible scheduled tasks:

### Every morning

Find:

```text
overdue debts
deliveries today
low stock
orders ready
```

Generate notifications.

### Daily

Generate internal business statistics if needed.

Do not precompute everything initially.

---

# 52. API Documentation

Use Swagger/OpenAPI.

Expose:

```text
/api/docs
```

Every endpoint should include:

* Description
* Authentication requirement
* DTO
* Response example
* Error responses

---

# 53. Environment Variables

Use:

```text
NODE_ENV
PORT

DATABASE_URL

JWT_ACCESS_SECRET
JWT_REFRESH_SECRET

REDIS_URL

STORAGE_ENDPOINT
STORAGE_BUCKET
STORAGE_ACCESS_KEY
STORAGE_SECRET_KEY

PUSH_NOTIFICATION_KEY
```

Never commit secrets.

Provide:

```text
.env.example
```

---

# 54. Testing

Use unit and integration tests.

Critical tests:

### Authentication

```text
register
login
refresh
logout
```

### Tenant isolation

```text
Business A cannot access Business B data.
```

### Sales

```text
sale creation
stock decrease
customer debt
partial payment
full payment
insufficient stock
sale cancellation
```

### Inventory

```text
purchase
adjustment
return
damage
negative stock prevention
```

### Payments

```text
customer payment
debt calculation
```

### Orders

```text
create
status transitions
delivery
```

The most important tests are **business transaction tests**, not just controller tests.

---

# 55. Status Transition Rules

Do not allow arbitrary status changes.

Example Order:

```text
NEW
 ↓
PREPARING
 ↓
READY
 ↓
DELIVERED
```

Allowed cancellation:

```text
NEW → CANCELLED
PREPARING → CANCELLED
```

Do not allow:

```text
DELIVERED → PREPARING
```

unless a future admin workflow explicitly supports it.

---

# 56. Business Type Customization

The backend should return business configuration.

Example:

```text
GET /business
```

Response:

```json
{
  "businessType": "CARPET",
  "features": {
    "orders": true,
    "deliveries": true,
    "expenses": true,
    "inventory": true
  }
}
```

Lighting may primarily use:

```text
Products
Sales
Inventory
Customers
Debts
Expenses
```

Carpet may additionally emphasize:

```text
Dimensions
m²
Deliveries
Debts
```

Furniture may emphasize:

```text
Orders
Preparation
Deliveries
Payments
Debts
```

Do not create completely separate backend systems for each business type.

---

# 57. Future Features — NOT V1

Do not implement these during initial development:

```text
Barcode
SKU
Accounting
Payroll
Tax accounting
Manufacturing
Complex supplier management
Multi-currency accounting
Advanced warehouse transfers
AI assistant
Marketplace integrations
Online payments
Customer mobile app
Complex subscription billing
```

Design the architecture so they can be added later.

---

# 58. Recommended Development Order

Implement in this order.

## Phase 1 — Foundation

```text
1. NestJS project
2. Prisma
3. PostgreSQL
4. Config
5. Global validation
6. Error handling
7. Swagger
8. JWT authentication
9. Users
10. Businesses
11. Branches
12. Staff / roles
```

## Phase 2 — Products

```text
1. Categories
2. Products
3. Product attributes
4. Inventory
5. Stock movements
```

## Phase 3 — Customers and Sales

```text
1. Customers
2. Sales
3. Sale items
4. Payments
5. Customer transactions
6. Debts
```

## Phase 4 — Purchases

```text
1. Purchases
2. Purchase items
3. Stock updates
```

## Phase 5 — Furniture/Carpet Workflow

```text
1. Orders
2. Order items
3. Deliveries
4. Status transitions
```

## Phase 6 — Money

```text
1. Expenses
2. Dashboard
3. Profit calculations
4. Reports
```

## Phase 7 — Notifications

```text
1. In-app notifications
2. Notification preferences
3. Background jobs
4. Push notifications
5. Scheduled debt/stock checks
```

## Phase 8 — Reliability

```text
1. Audit logs
2. Integration tests
3. Concurrency tests
4. Performance optimization
5. Database indexes
6. Security review
```

---

# 59. Claude Code Implementation Rules

When implementing this project:

### Rule 1

Do not implement everything in one huge step.

Build one module at a time.

### Rule 2

Before writing code, inspect the existing project.

Do not overwrite an existing working architecture without understanding it.

### Rule 3

Use Prisma migrations.

Never manually modify production database tables.

### Rule 4

Every business operation must respect tenant isolation.

### Rule 5

Use database transactions for financial/inventory operations.

### Rule 6

Do not duplicate business logic between controllers.

Controllers should be thin.

Preferred:

```text
Controller
    ↓
Service
    ↓
Prisma
```

### Rule 7

Use DTOs for all external input.

### Rule 8

Do not expose Prisma models directly when an explicit API response DTO is more appropriate.

### Rule 9

Never trust `businessId`, `userId`, or `createdById` from the client.

Derive them from authentication context.

### Rule 10

Do not add unnecessary dependencies.

Prefer NestJS/Prisma/PostgreSQL capabilities before adding another library.

### Rule 11

Write tests for critical business rules before considering the module complete.

### Rule 12

Do not implement future features unless explicitly requested.

---

# 60. Definition of Done

A module is complete only when:

```text
[ ] Module exists
[ ] Controller exists
[ ] Service exists
[ ] DTO validation exists
[ ] Prisma model exists
[ ] Migration exists
[ ] Authentication is enforced
[ ] Tenant isolation is enforced
[ ] Permissions are enforced
[ ] Error handling exists
[ ] Swagger documentation exists
[ ] Unit tests exist where appropriate
[ ] Integration tests exist for critical business operations
```

For financial/inventory modules:

```text
[ ] Database transactions
[ ] Concurrency considerations
[ ] Audit logging
[ ] Cancellation/reversal logic
```

---

# 61. First MVP

The first production-capable version should focus on:

```text
AUTH
 │
 ├── Business
 ├── Staff
 │
PRODUCTS
 │
 ├── Categories
 └── Inventory
 │
CUSTOMERS
 │
 └── Debts
 │
SALES
 │
 └── Payments
 │
PURCHASES
 │
EXPENSES
 │
DASHBOARD
```

Furniture-specific:

```text
ORDERS
DELIVERIES
```

should be included after the core sales flow is stable.

The product should feel fast and simple, not like an ERP.

The most important user workflow is:

```text
Open app
   ↓
Create sale
   ↓
Select product
   ↓
Select customer
   ↓
Enter paid amount
   ↓
Remaining amount becomes debt
   ↓
Stock decreases
   ↓
Dashboard updates
```

This workflow must be extremely reliable.

---

# 62. Final Architecture

```text
                    ┌─────────────────────┐
                    │   Expo React Native │
                    └──────────┬──────────┘
                               │
                              REST
                               │
                    ┌──────────▼──────────┐
                    │       NestJS        │
                    │   Modular Monolith  │
                    └──────────┬──────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
    ┌─────▼─────┐       ┌──────▼──────┐      ┌─────▼─────┐
    │   Auth    │       │  Business   │      │   Staff   │
    └───────────┘       └─────────────┘      └───────────┘
          │
          ├──────────────────────────────────────────┐
          │                                          │
    ┌─────▼─────┐       ┌─────────────┐       ┌─────▼─────┐
    │ Products  │──────▶│  Inventory  │       │ Customers │
    └───────────┘       └─────────────┘       └─────┬─────┘
                                                     │
                                               ┌─────▼─────┐
                                               │   Debts   │
                                               └─────┬─────┘
                                                     │
    ┌───────────┐       ┌─────────────┐       ┌─────▼─────┐
    │ Purchases │       │    Sales    │──────▶│ Payments  │
    └───────────┘       └─────────────┘       └───────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
              ┌─────▼─────┐       ┌──────▼──────┐
              │   Orders  │       │  Expenses   │
              └─────┬─────┘       └─────────────┘
                    │
              ┌─────▼─────┐
              │ Deliveries│
              └───────────┘

                         │
                  ┌──────▼──────┐
                  │ PostgreSQL  │
                  └─────────────┘
                         │
                  ┌──────▼──────┐
                  │    Redis    │
                  │   (later)   │
                  └─────────────┘
```

The guiding principle is:

> **Simple UI, strong backend.**

The mobile application should feel extremely simple to the business owner, while the NestJS backend handles the difficult parts—transactions, stock consistency, debt calculation, permissions, tenant isolation, audit history, and concurrency safely.

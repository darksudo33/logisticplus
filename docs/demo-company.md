# شرکت نمایشی پارس‌راه

این seed یک tenant مستقل برای ارائه محصول می‌سازد:

- شرکت: حمل‌ونقل بین‌المللی پارس‌راه
- حوزه فعالیت: حمل‌ونقل بین‌المللی، ترخیص، ارسال زمینی و دریایی
- شهر: تهران
- تلفن: `021-91094720`
- ایمیل: `demo@logisticplus.ir`

## اجرا

```bash
npm run db:seed:demo
```

برای تعیین رمز اختصاصی:

```bash
DEMO_SEED_PASSWORD="YourStrongPassword" npm run db:seed:demo
```

در production، اسکریپت بدون اجازه صریح اجرا نمی‌شود:

```bash
DEMO_SEED_ALLOW_PRODUCTION=true DEMO_SEED_PASSWORD="YourStrongPassword" npm run db:seed:demo
```

## ورود

کاربر اصلی ارائه:

- Email: `manager.parsrah@logisticplus.ir`
- Password: مقدار `DEMO_SEED_PASSWORD` یا fallback محلی `ParsRah!1405`
- Role: `MANAGER`

کاربران عادی دیگر:

- `ops.parsrah@logisticplus.ir`، کارشناس عملیات
- `finance.parsrah@logisticplus.ir`، کارشناس مالی

هیچ‌کدام platform admin نیستند و نباید به `/admin` یا APIهای `/api/admin/*` دسترسی داشته باشند.

## داده‌های ساخته‌شده

- ۵ مشتری فارسی واقعی‌نما
- ۱۰ محموله با وضعیت‌های فعال، تکمیل‌شده، پرریسک، در انتظار مدارک، در حال ترخیص و آماده ارسال
- مراحل تاریخی و عمومی محموله‌ها
- ۸ سند فعال و ۱ سند بایگانی‌شده، با فایل‌های متنی امن در `DOCUMENT_STORAGE_DIR`
- ۳ پیش‌فاکتور فعال و ۱ پیش‌فاکتور بایگانی‌شده
- ۴ چک عملیاتی
- ۳ جلسه/مورد انطباق با مدارک موردنیاز
- ۵ لینک پیگیری عمومی مشتری

## لینک‌های پیگیری نمونه

با `APP_PUBLIC_URL=http://localhost:3000`:

- `http://localhost:3000/track/parsrah-pr1405001-customer-access-2026`
- `http://localhost:3000/track/parsrah-pr1405002-customer-access-2026`
- `http://localhost:3000/track/parsrah-pr1405003-customer-access-2026`
- `http://localhost:3000/track/parsrah-pr1405004-customer-access-2026`
- `http://localhost:3000/track/parsrah-pr1405005-customer-access-2026`

## جداسازی و امنیت

تمام رکوردهای tenant-owned با `organization_id=org-parsrah-international` ساخته می‌شوند. اسکریپت قبل از بازسازی، فقط همین سازمان seed‌شده را پاک می‌کند و اگر سازمان یا کاربران هم‌نام بدون marker داخلی seed پیدا کند، اجرا را متوقف می‌کند.

پیگیری عمومی از DTO allowlist استفاده می‌کند و فقط وضعیت محموله، مراحل عمومی، اسناد `customer_visible` و اطلاعات تماس شرکت را برمی‌گرداند. یادداشت داخلی، شناسه سازمان، owner، token/hash، چک‌ها، وظایف، جلسات انطباق و داده‌های مالی در پاسخ عمومی وجود ندارند.

چک کوتاه:

```bash
npm run db:seed:demo
# با manager.parsrah@logisticplus.ir وارد شوید
# GET /api/admin/overview باید 403 برگرداند و مسیر /admin باید به /dashboard برگردد.
```

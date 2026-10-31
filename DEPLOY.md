# Đưa Tiki lên mạng

Khoá API **không nằm trong code**. Trên máy, khoá ở tệp `.env.local` (Git bỏ qua tệp này). Trên GitHub, khoá ở mục **Secrets**. Vì vậy GitHub không thấy khoá trong repo và không khoá tài khoản.

## 1. Đẩy code lên GitHub
1. Giải nén `tiki.zip`, đẩy **nội dung** thư mục `tiki` lên nhánh **main** (phải có thư mục `.github`).
2. **Không** đẩy tệp `.env.local` (đã có trong `.gitignore`; trong zip cũng không có).

## 2. Thêm khoá vào GitHub Secrets
Repo > **Settings** > **Secrets and variables** > **Actions** > **New repository secret**. Thêm từng cái (Name phải gõ đúng):

| Name | Value |
|---|---|
| `VITE_YOUTUBE_API_KEY` | khoá YouTube của bạn |
| `VITE_FIREBASE_API_KEY` | `apiKey` trong cấu hình Firebase (bước 4) |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `VITE_FIREBASE_DATABASE_URL` | `databaseURL` |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` |
| `VITE_FIREBASE_APP_ID` | `appId` |

## 3. Bật GitHub Pages
Repo > **Settings** > **Pages** > Source chọn **GitHub Actions**. Vào tab **Actions** > **Deploy to GitHub Pages** > **Run workflow**. Đợi dấu tích xanh, trang ở `https://<tên-bạn>.github.io/<tên-repo>/`. Thêm hay đổi secret thì bấm Run workflow lại.

## 4. Firebase (chơi nhiều người)
1. console.firebase.google.com > **Create a project** > đặt tên `tiki` > tắt Google Analytics > Create. Gói **Spark** miễn phí, không cần thẻ.
2. Menu trái **Build** > **Realtime Database** > **Create Database** > chọn **Singapore** > chọn **Start in locked mode** > Enable.
3. Ở trang Realtime Database, bấm thẻ **Rules**. Bấm vào ô chữ, **xoá hết** nội dung cũ, mở tệp `database.rules.json` trong repo, chép **toàn bộ** rồi dán vào, bấm **Publish**. Chỉ cần làm một lần.
4. Bấm bánh răng cạnh **Project Overview** > **Project settings** > kéo xuống **Your apps** > bấm biểu tượng **</>** > đặt tên > **Register app**. Màn hình hiện `firebaseConfig = { apiKey: ..., authDomain: ..., databaseURL: ..., projectId: ..., appId: ... }`. Chép từng giá trị (không lấy dấu nháy) vào Secrets ở bước 2.
5. Không thấy `databaseURL`? Quay lại Realtime Database, chép địa chỉ ở đầu trang (dạng `https://tiki-xxxx-default-rtdb.asia-southeast1.firebasedatabase.app`).

## 5. Giới hạn khoá YouTube (nên làm)
console.cloud.google.com > **APIs & Services** > **Credentials** > bấm vào khoá > **Websites** > thêm `https://<tên-bạn>.github.io/*` và `http://localhost:5173/*` > Save.

## Chạy trên máy
Tạo tệp `.env.local` theo mẫu `.env.example`, rồi chạy `npm install` và `npm run dev`.

## Lưu ý
- Khoá vẫn có trong trang đã build (trình duyệt cần nó); giới hạn tên miền ở bước 5 để người khác không dùng được.
- Quyền chủ phòng chỉ kiểm tra trên máy người chơi.
- Nhạc trên máy: chủ phòng phải chọn lại tệp sau mỗi lần tải lại trang.

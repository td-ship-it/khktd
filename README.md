# Hội nghị Khoa học kỹ thuật Dược lần thứ 43 – Đăng ký, điểm danh, khảo sát, chứng nhận

```
Người dùng ──► Cloudflare Worker (trang web + proxy /api) ──► Google Apps Script (API) ──► Google Sheet (dữ liệu)
                                                                     └─► MailApp (hàng đợi, ≤1.400 mail/ngày)
```

| Thành phần | Việc làm | Thư mục |
|---|---|---|
| Google Apps Script | API, Google Sheet làm CSDL, tài khoản, hàng đợi mail, tạo PDF chứng nhận | `apps-script/` |
| Cloudflare Worker | Phục vụ giao diện, proxy `/api` tới Apps Script (ẩn URL + khoá) | `src/worker.js`, `public/` |
| GitHub + Cloudflare Builds | Tự deploy Worker khi push lên `main` | cấu hình trên Cloudflare |

## Luồng sử dụng

1. **Đăng ký** (`/`): họ tên, SĐT, email, đơn vị → email xác nhận kèm **QR cá nhân** gửi ngay. Đăng ký trùng SĐT + đúng email = gửi lại mail (tối đa 3 lần).
2. **Điểm danh** (3 cách, cùng ghi vào một bảng, không trùng):
   - **QR cá nhân** (`/scan`): nhân viên quét QR trong email bằng camera điện thoại hoặc **máy quét cầm tay** (loại giả lập bàn phím cũng dùng được).
   - **QR chung** (`/screen` chiếu lên màn hình hội trường): người dự quét → nhập SĐT → vào thẳng khảo sát. Mã **đổi mỗi 90 giây** nên không điểm danh hộ từ xa được.
   - **Kiosk SĐT** (`/kiosk`): bàn hỗ trợ, nhập SĐT → khảo sát ngay trên máy → chứng nhận (hiện QR để người dự mở lại trên điện thoại).
3. **Khảo sát** (`/survey?t=…`): chỉ người đã điểm danh mới làm được, mỗi người một lần.
4. **Chứng nhận** (`/certificate?t=…`): hiện **ngay trên web** sau khi gửi khảo sát, tải PDF tại chỗ; email kèm PDF được xếp hàng gửi sau. Mã chứng nhận kiểm tra tại `/verify`.
5. **Quản trị** (`/admin`): thống kê trực tiếp, hạn mức mail, xuất CSV (mở bằng Excel); dữ liệu gốc nằm trong Google Sheet.

## Hàng đợi mail và hạn mức 1.500/ngày

- Mọi mail vào sheet `HangDoiMail`. Mỗi ngày gửi tối đa **1.400** (chừa 100 dự phòng, chỉnh ở `LIMITS.dailyMail`); phần dư tự chuyển sang ngày hôm sau.
- Trigger chạy mỗi 5 phút. Mail đăng ký vẫn được thử gửi ngay; nếu hết hạn mức thì nằm chờ trong hàng đợi.
- Mail lỗi tạm thời thử lại tối đa 3 lần; email sai định dạng bị đánh dấu `failed`.
- Giờ reset hạn mức của Google tính theo 24 giờ trượt, còn bộ đếm của hệ thống tính theo ngày lịch. Chênh lệch này đã được bù bằng khoảng chừa 100 mail và kiểm tra `getRemainingDailyQuota()`.

## Cài đặt (làm một lần)

### 1. Google Apps Script
1. Vào <https://script.google.com> → **Dự án mới**, đặt tên `hoi-nghi-duoc-43`.
2. Sao chép các file trong `apps-script/` vào dự án (`*.gs`, và `appsscript.json` – bật *Hiển thị tệp kê khai appsscript.json* ở Cài đặt dự án). Hoặc dùng clasp:
   ```bash
   npm i -g @google/clasp && clasp login
   cd apps-script && clasp create --type standalone --title "hoi-nghi-duoc-43" && clasp push
   ```
3. Mở `Config.gs`, thay các giá trị `[…]` (ngày, địa điểm, đơn vị tổ chức, người ký…) và chỉnh câu hỏi khảo sát.
4. **Cài đặt dự án → Thuộc tính tập lệnh**: thêm `SITE_URL` = địa chỉ Worker (ví dụ `https://hoi-nghi-duoc-43.<tài-khoản>.workers.dev`, có thể thêm sau khi deploy Worker).
5. Chọn hàm **`setup`** → *Chạy* → cấp quyền. Xem **Nhật ký thực thi** để lấy: link Google Sheet, `API_KEY`, `ADMIN_PASSWORD` (nên đổi mật khẩu trong Script Properties).
6. Chạy thử **`sendTestMail`** để xem email mẫu gửi tới chính bạn.
7. **Triển khai → Triển khai mới → Ứng dụng web**: *Thực thi bằng tài khoản của tôi*, *Ai có quyền truy cập: Bất kỳ ai*. Sao chép URL `…/exec` (đây là `GAS_URL`).
   > Mỗi lần sửa code Apps Script phải **Quản lý bản triển khai → Chỉnh sửa → Phiên bản mới**, URL `/exec` được giữ nguyên.

### 2. GitHub + Cloudflare Workers (kết nối trực tiếp, không cần API token)
1. Đẩy toàn bộ thư mục này lên nhánh `main` của repo GitHub. Tên Worker trong `wrangler.toml` (`name = "khktd"`) phải trùng tên Worker trên Cloudflare.
2. Cloudflare → Worker → **Settings → Builds → Connect** repo, nhánh `main`, lệnh deploy mặc định `npx wrangler deploy`. Mỗi lần push, Cloudflare tự build và deploy.
3. Cloudflare → Worker → **Settings → Variables and Secrets → Add**, kiểu **Secret**, thêm 2 giá trị:
   - `GAS_URL`: URL Web App Apps Script (`…/exec`)
   - `API_KEY`: giá trị lấy ở bước 5 phần Apps Script
   (Thêm ở đây, không thêm ở mục *Build variables*.)
4. Lấy địa chỉ Worker (`https://<tên>.<tài-khoản>.workers.dev`), điền vào `SITE_URL` ở Apps Script. Gắn tên miền riêng nếu muốn, khi đó cập nhật lại `SITE_URL`.

Deploy tay (không qua GitHub): `npm i && npx wrangler login && npx wrangler deploy`, rồi thêm 2 secret ở bước 3.

## Giấy chứng nhận theo mẫu Google Slides

Mẫu nằm ở `template/mau-chung-nhan.pptx` (A4 ngang, đã có chỗ điền). Các chỗ điền trong mẫu:

| Chỗ điền | Nội dung |
|---|---|
| `{{HOTEN}}` | Họ tên, tự viết hoa; tên dài tự giảm cỡ chữ |
| `{{MACN}}` | Mã chứng nhận để xác thực tại `/verify` (dòng nhỏ góc dưới trái, xóa được nếu không cần) |
| `{{DONVI}}`, `{{NGAYCAP}}` | Tuỳ chọn, mẫu hiện không dùng. Thêm vào mẫu nếu muốn in đơn vị hoặc ngày cấp (dd/MM/yyyy) |

Các dòng còn lại (ngày hội nghị, ngày ký, người ký…) là chữ cố định trong mẫu, muốn đổi thì sửa trực tiếp trong Slides.

**Cài đặt**
1. Tải `mau-chung-nhan.pptx` lên Google Drive → chuột phải → *Mở bằng Google Trang trình bày* → *Tệp → Lưu dưới dạng Google Trang trình bày*.
2. Mở file Slides vừa lưu, lấy ID trên thanh địa chỉ (đoạn giữa `/d/` và `/edit`).
3. Apps Script → Cài đặt dự án → Thuộc tính tập lệnh: thêm `CERT_TEMPLATE_ID` = ID đó.
4. Chạy hàm `testCertificate` (lần đầu cấp quyền Drive và Slides). Hàm tạo file `THU-giay-chung-nhan.pdf` trong Drive để bạn xem. Chạy lại `setup()` để tạo thư mục lưu PDF.
5. Triển khai → Quản lý bản triển khai → Chỉnh sửa → Phiên bản mới.

**Cách hoạt động**: lần đầu một người xem chứng nhận, hệ thống sao chép mẫu, thay chữ, xuất PDF (khoảng 3–6 giây), lưu vào thư mục Drive `Hội nghị Dược 43 – Chứng nhận PDF` rồi xóa bản sao. Những lần sau, trang web và email đều dùng lại file PDF đã lưu nên nhanh và không tạo lại. Dung lượng khoảng 0,3–1 MB mỗi người. Chưa đặt `CERT_TEMPLATE_ID` thì hệ thống dùng mẫu HTML dự phòng (A4 dọc).

## Tài khoản, phân quyền và khóa/mở điểm danh

Mọi công cụ cho Ban tổ chức (`/admin`, `/screen`, `/scan`, `/kiosk`) đăng nhập bằng **tên đăng nhập + mật khẩu**.

- Tài khoản **`admin`**: mật khẩu là Script Property `ADMIN_PASSWORD`. Tài khoản này cố định, không sửa hay xóa trong giao diện.
- Trong `/admin` → **Người dùng & phân quyền**, admin tạo thêm tài khoản cho người phối hợp:
  - **Hỗ trợ điểm danh**: chỉ dùng được màn hình QR điểm danh, quét QR và kiosk. Vào `/admin` chỉ thấy trạng thái điểm danh và các nút mở công cụ, không xem được danh sách, thống kê, xuất dữ liệu.
  - **Quản trị**: toàn quyền.
  - Có thể sửa, khóa, đặt lại mật khẩu (tạo ngẫu nhiên, chỉ hiện một lần), xóa. Khóa hoặc đổi mật khẩu thì người đó bị đăng xuất ngay. Phiên đăng nhập tự hết hạn sau 12 giờ.
- Bảng `DiemDanh` ghi thêm cột **Nhân viên thực hiện** (tên đăng nhập người quét hoặc dùng kiosk).
- Nút **Mở/Khóa điểm danh** ở đầu trang `/admin` (chỉ admin bấm được). **Mặc định là KHÓA**. Khi khóa, cả 3 cách điểm danh bị chặn: QR cá nhân, QR chung, kiosk. Màn hình `/screen` hiện "Điểm danh đang khóa" thay cho mã QR.
- **Mã QR đăng ký** ở `/admin`: bấm **Tải mã QR** để lấy ảnh PNG 1200×1200 px nền trắng, dùng in poster và thư mời. QR trỏ tới `https://khktd.truongduoc.workers.dev/`. Khi đổi sang tên miền khác, sửa hằng số `REG_URL` ở đầu phần script trong `public/admin.html`, push lên rồi tải lại QR.

## Banner và chân trang

- **Banner** trang đăng ký: chép ảnh vào `public/assets/banner.jpg` (hoặc `.png`, `.webp`) rồi push. Nên dùng ảnh ngang tỉ lệ khoảng 16:5 (ví dụ 1920×600 px), dung lượng dưới 300 KB. Không có file thì banner tự ẩn.
- **Chân trang** mọi trang (trừ màn hình `/screen`): "Phát triển bởi Bộ môn Công nghệ thông tin dược phối hợp cùng Ban tổ chức Hội nghị". Muốn đổi chữ thì sửa trong `public/assets/app.js`.

## Vận hành ngày hội nghị

1. Trước giờ G: đăng nhập `/admin` bằng `admin`, tạo tài khoản cho từng người phối hợp, gửi tên đăng nhập và mật khẩu cho họ.
2. Khi bắt đầu: bấm **Mở điểm danh**.
3. Bàn đón tiếp: mở `/scan` trên điện thoại hoặc máy tính, đăng nhập một lần (hoặc cắm máy quét cầm tay, con trỏ luôn nằm sẵn trong ô nhập).
4. Màn hình lớn ở cửa: mở `/screen` rồi để toàn màn hình. Muốn dán QR giấy cố định thì đặt Script Property `STATIC_HALL_CODE` (ví dụ `HNDUOC43`) và in QR trỏ tới `https://<tên-miền>/checkin?c=HNDUOC43`. Mã tĩnh kém an toàn hơn mã xoay vòng, nên xóa property này sau khi kết thúc.
5. Bàn hỗ trợ: máy tính bảng mở `/kiosk`. Người chưa đăng ký thì đăng ký tại chỗ ở `/` rồi điểm danh.
6. Kết thúc: bấm **Khóa điểm danh**. Theo dõi số liệu ở `/admin`.

## Giới hạn và lưu ý

- **Chịu tải**: Apps Script ghi tuần tự bằng khoá nên mỗi thao tác ghi mất khoảng 0,3–1 giây. Dòng người vào cửa trải ra nhiều phút thì ổn. Nếu có hàng trăm người đăng ký/điểm danh trong cùng vài giây thì một số người có thể thấy "Hệ thống đang quá tải" và phải bấm lại. Nên mở đăng ký sớm, và khi điểm danh vẫn dùng đủ 3 cách để chia tải.
- **Điểm danh bằng SĐT** chỉ xác minh người dùng biết số đã đăng ký. Mã QR chung xoay vòng giảm việc điểm danh hộ từ xa, nhưng không chặn được người ngồi trong phòng nhập số của người khác. Tên hiển thị ở luồng này được che bớt.
- **Chứng nhận**: cần đặt `CERT_TEMPLATE_ID` để dùng mẫu Slides. Mẫu không có chữ ký hoặc con dấu dạng ảnh. Muốn có thì chèn ảnh chữ ký vào trong Slides.
- **QR trong email** được tạo bằng dịch vụ `api.qrserver.com` (mã token đi qua bên thứ ba). Nếu không muốn, đổi `qrBlob_`/`qrUrl_` sang thư viện QR tự lưu trong dự án.
- Nên thêm **Rate limiting rule** trong Cloudflare (Security → WAF) cho đường dẫn `/api` để chống spam đăng ký.
- Dữ liệu cá nhân (họ tên, SĐT, email) lưu trong Google Sheet của tài khoản triển khai: không chia sẻ sheet công khai.

## Kiểm thử

`npm test` chạy bộ kiểm thử giả lập Apps Script trong bộ nhớ: đăng ký, 3 cách điểm danh, khảo sát, chứng nhận, hàng đợi và hạn mức (mô phỏng 1.600 mail), Worker. Phần chưa kiểm thử được ngoài môi trường thật: gửi mail thật, chuyển PDF của Google và triển khai Cloudflare.

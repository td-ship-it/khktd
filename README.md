# Hội nghị Khoa học kỹ thuật Dược lần thứ 43 – Đăng ký, điểm danh, khảo sát, chứng nhận

```
Người dùng ──► Cloudflare Worker (trang web + proxy /api) ──► Google Apps Script (API) ──► Google Sheet (dữ liệu)
                                                                     └─► MailApp (hàng đợi, ≤1.400 mail/ngày)
```

| Thành phần | Việc làm | Thư mục |
|---|---|---|
| Google Apps Script | API, Google Sheet làm CSDL, hàng đợi mail, tạo PDF chứng nhận | `apps-script/` |
| Cloudflare Worker | Phục vụ giao diện, proxy `/api` tới Apps Script (ẩn URL + khoá) | `src/worker.js`, `public/` |
| GitHub Actions | Tự deploy Worker khi push lên `main` | `.github/workflows/deploy.yml` |

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

### 2. GitHub + Cloudflare Workers
1. Tạo repo GitHub, đẩy toàn bộ thư mục này lên nhánh `main`.
2. Cloudflare: **My Profile → API Tokens → Create Token** dùng mẫu *Edit Cloudflare Workers*. Ghi lại `Account ID`.
3. GitHub repo → **Settings → Secrets and variables → Actions**, thêm 4 secret:
   `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `GAS_URL`, `API_KEY` (giá trị `API_KEY` lấy ở bước 5 phần Apps Script).
4. Push lên `main` (hoặc chạy tay *Actions → Deploy → Run workflow*) → Worker được deploy cùng 2 secret.
5. Lấy địa chỉ Worker, điền vào `SITE_URL` ở Apps Script; gắn tên miền riêng trong Cloudflare nếu muốn (khi đó cập nhật lại `SITE_URL`).

Deploy tay (không qua GitHub): `npm i && npx wrangler secret put GAS_URL && npx wrangler secret put API_KEY && npx wrangler deploy`.

## Vận hành ngày hội nghị

- Bàn đón tiếp: mở `/scan` trên điện thoại/máy tính, đăng nhập một lần (hoặc cắm máy quét cầm tay, con trỏ luôn nằm sẵn trong ô nhập).
- Màn hình lớn ở cửa: mở `/screen` rồi để toàn màn hình. Muốn dán QR giấy cố định thì đặt Script Property `STATIC_HALL_CODE` (ví dụ `HNDUOC43`) và in QR trỏ tới `https://<tên-miền>/checkin?c=HNDUOC43`. Mã tĩnh kém an toàn hơn mã xoay vòng, nên xoá property này sau khi kết thúc.
- Bàn hỗ trợ: máy tính bảng mở `/kiosk`. Người chưa đăng ký đăng ký tại chỗ ở `/` rồi điểm danh.
- Theo dõi: `/admin`.

## Giới hạn và lưu ý

- **Chịu tải**: Apps Script ghi tuần tự bằng khoá nên mỗi thao tác ghi mất khoảng 0,3–1 giây. Dòng người vào cửa trải ra nhiều phút thì ổn. Nếu có hàng trăm người đăng ký/điểm danh trong cùng vài giây thì một số người có thể thấy "Hệ thống đang quá tải" và phải bấm lại. Nên mở đăng ký sớm, và khi điểm danh vẫn dùng đủ 3 cách để chia tải.
- **Điểm danh bằng SĐT** chỉ xác minh người dùng biết số đã đăng ký. Mã QR chung xoay vòng giảm việc điểm danh hộ từ xa, nhưng không chặn được người ngồi trong phòng nhập số của người khác. Tên hiển thị ở luồng này được che bớt.
- **PDF chứng nhận** do Apps Script chuyển từ HTML nên khổ **A4 dọc**, phông chữ hệ thống. Nếu cần khổ ngang hoặc mẫu thiết kế riêng thì thay bằng mẫu Google Slides, cần sửa `Certificate.gs`.
- **QR trong email** được tạo bằng dịch vụ `api.qrserver.com` (mã token đi qua bên thứ ba). Nếu không muốn, đổi `qrBlob_`/`qrUrl_` sang thư viện QR tự lưu trong dự án.
- Nên thêm **Rate limiting rule** trong Cloudflare (Security → WAF) cho đường dẫn `/api` để chống spam đăng ký.
- Dữ liệu cá nhân (họ tên, SĐT, email) lưu trong Google Sheet của tài khoản triển khai: không chia sẻ sheet công khai.

## Kiểm thử

`npm test` chạy bộ kiểm thử giả lập Apps Script trong bộ nhớ: đăng ký, 3 cách điểm danh, khảo sát, chứng nhận, hàng đợi và hạn mức (mô phỏng 1.600 mail), Worker. Phần chưa kiểm thử được ngoài môi trường thật: gửi mail thật, chuyển PDF của Google và triển khai Cloudflare.

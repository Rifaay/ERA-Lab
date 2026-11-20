import qrcode from "qrcode-generator";

// A QR code as an image address (GIF) that every browser shows, iPhone Safari included.
export const qrImage = (text, cell = 6) => { const q = qrcode(0, "M"); q.addData(text); q.make(); return q.createDataURL(cell, 2); };

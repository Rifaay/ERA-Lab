// The PDF font (Arabic and Latin letters), loaded only when a PDF is made: it never weighs on opening the app.
import regular from "@expo-google-fonts/noto-naskh-arabic/400Regular/NotoNaskhArabic_400Regular.ttf?inline";
import bold from "@expo-google-fonts/noto-naskh-arabic/700Bold/NotoNaskhArabic_700Bold.ttf?inline";

const b64 = (dataUrl) => dataUrl.slice(dataUrl.indexOf(",") + 1);
export default { regular: b64(regular), bold: b64(bold) };

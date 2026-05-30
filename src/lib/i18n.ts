import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SupportedLanguage = "en" | "hi" | "mr" | "ta" | "te";

export const LANGUAGES: { code: SupportedLanguage; name: string; nativeName: string }[] = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
  { code: "mr", name: "Marathi", nativeName: "मराठी" },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்" },
  { code: "te", name: "Telugu", nativeName: "తెలుగు" },
];

// Translation store
interface I18nState {
  language: SupportedLanguage;
  translations: Record<string, string>;
  setLanguage: (lang: SupportedLanguage) => void;
}

// English translations (default)
const EN_TRANSLATIONS: Record<string, string> = {
  "nav.dashboard": "Dashboard",
  "nav.students": "Students",
  "nav.courses": "Courses",
  "nav.exams": "MCQ Tests",
  "nav.attendance": "Attendance",
  "nav.fees": "Fees & Billing",
  "nav.settings": "Settings",
  "nav.certificates": "Certificates",
  "nav.analytics": "Analytics",
  "nav.reports": "Reports",
  "nav.messages": "Communication",
  "nav.ai": "AI Assistant",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.search": "Search",
  "common.loading": "Loading...",
  "common.noData": "No data available",
  "common.export": "Export",
  "common.download": "Download",
  "dashboard.welcome": "Welcome",
  "dashboard.overview": "Overview",
  "dashboard.totalStudents": "Total Students",
  "dashboard.activeStaff": "Active Staff",
  "dashboard.revenue": "Revenue (MTD)",
  "dashboard.coursesLive": "Courses Live",
  "settings.language": "Language",
  "settings.selectLanguage": "Select your preferred language",
};

// Hindi translations
const HI_TRANSLATIONS: Record<string, string> = {
  "nav.dashboard": "डैशबोर्ड",
  "nav.students": "छात्र",
  "nav.courses": "पाठ्यक्रम",
  "nav.exams": "MCQ परीक्षा",
  "nav.attendance": "उपस्थिति",
  "nav.fees": "शुल्क एवं बिलिंग",
  "nav.settings": "सेटिंग्स",
  "nav.certificates": "प्रमाणपत्र",
  "nav.analytics": "विश्लेषण",
  "nav.reports": "रिपोर्ट",
  "nav.messages": "संचार",
  "nav.ai": "AI सहायक",
  "common.save": "सहेजें",
  "common.cancel": "रद्द करें",
  "common.delete": "हटाएं",
  "common.edit": "संपादित करें",
  "common.search": "खोजें",
  "common.loading": "लोड हो रहा है...",
  "common.noData": "कोई डेटा उपलब्ध नहीं",
  "common.export": "निर्यात",
  "common.download": "डाउनलोड",
  "dashboard.welcome": "स्वागत है",
  "dashboard.overview": "अवलोकन",
  "dashboard.totalStudents": "कुल छात्र",
  "dashboard.activeStaff": "सक्रिय स्टाफ",
  "dashboard.revenue": "राजस्व (MTD)",
  "dashboard.coursesLive": "लाइव पाठ्यक्रम",
  "settings.language": "भाषा",
  "settings.selectLanguage": "अपनी पसंदीदा भाषा चुनें",
};

// Marathi translations
const MR_TRANSLATIONS: Record<string, string> = {
  "nav.dashboard": "डॅशबोर्ड",
  "nav.students": "विद्यार्थी",
  "nav.courses": "अभ्यासक्रम",
  "nav.exams": "MCQ परीक्षा",
  "nav.attendance": "उपस्थिती",
  "nav.fees": "शुल्क आणि बिलिंग",
  "nav.settings": "सेटिंग्ज",
  "nav.certificates": "प्रमाणपत्रे",
  "nav.analytics": "विश्लेषण",
  "nav.reports": "अहवाल",
  "nav.messages": "संवाद",
  "nav.ai": "AI सहाय्यक",
  "common.save": "जतन करा",
  "common.cancel": "रद्द करा",
  "common.delete": "हटवा",
  "common.edit": "संपादित करा",
  "common.search": "शोधा",
  "common.loading": "लोड होत आहे...",
  "common.noData": "डेटा उपलब्ध नाही",
  "common.export": "निर्यात",
  "common.download": "डाउनलोड",
  "dashboard.welcome": "स्वागत",
  "dashboard.overview": "आढावा",
  "dashboard.totalStudents": "एकूण विद्यार्थी",
  "dashboard.activeStaff": "सक्रिय कर्मचारी",
  "dashboard.revenue": "महसूल (MTD)",
  "dashboard.coursesLive": "लाइव अभ्यासक्रम",
  "settings.language": "भाषा",
  "settings.selectLanguage": "तुमची पसंतीची भाषा निवडा",
};

// Tamil translations
const TA_TRANSLATIONS: Record<string, string> = {
  "nav.dashboard": "டாஷ்போர்டு",
  "nav.students": "மாணவர்கள்",
  "nav.courses": "பாடநெறிகள்",
  "nav.exams": "MCQ தேர்வுகள்",
  "nav.attendance": "வருகைப்பதிவு",
  "nav.fees": "கட்டணம்",
  "nav.settings": "அமைப்புகள்",
  "nav.certificates": "சான்றிதழ்கள்",
  "nav.analytics": "பகுப்பாய்வு",
  "nav.reports": "அறிக்கைகள்",
  "nav.messages": "தொடர்பு",
  "nav.ai": "AI உதவியாளர்",
  "common.save": "சேமி",
  "common.cancel": "ரத்து",
  "common.delete": "நீக்கு",
  "common.edit": "திருத்து",
  "common.search": "தேடு",
  "common.loading": "ஏற்றுகிறது...",
  "common.noData": "தரவு இல்லை",
  "common.export": "ஏற்றுமதி",
  "common.download": "பதிவிறக்கம்",
  "dashboard.welcome": "வரவேற்பு",
  "dashboard.overview": "கண்ணோட்டம்",
  "dashboard.totalStudents": "மொத்த மாணவர்கள்",
  "dashboard.activeStaff": "செயலில் உள்ள ஊழியர்கள்",
  "dashboard.revenue": "வருவாய் (MTD)",
  "dashboard.coursesLive": "நேரடி பாடநெறிகள்",
  "settings.language": "மொழி",
  "settings.selectLanguage": "உங்கள் விருப்ப மொழியைத் தேர்ந்தெடுக்கவும்",
};

// Telugu translations
const TE_TRANSLATIONS: Record<string, string> = {
  "nav.dashboard": "డాష్‌బోర్డ్",
  "nav.students": "విద్యార్థులు",
  "nav.courses": "కోర్సులు",
  "nav.exams": "MCQ పరీక్షలు",
  "nav.attendance": "హాజరు",
  "nav.fees": "ఫీజులు",
  "nav.settings": "సెట్టింగ్‌లు",
  "nav.certificates": "సర్టిఫికేట్లు",
  "nav.analytics": "విశ్లేషణ",
  "nav.reports": "నివేదికలు",
  "nav.messages": "సంభాషణ",
  "nav.ai": "AI సహాయకుడు",
  "common.save": "సేవ్",
  "common.cancel": "రద్దు",
  "common.delete": "తొలగించు",
  "common.edit": "సవరించు",
  "common.search": "వెతుకు",
  "common.loading": "లోడ్ అవుతోంది...",
  "common.noData": "డేటా అందుబాటులో లేదు",
  "common.export": "ఎగుమతి",
  "common.download": "డౌన్‌లోడ్",
  "dashboard.welcome": "స్వాగతం",
  "dashboard.overview": "అవలోకనం",
  "dashboard.totalStudents": "మొత్తం విద్యార్థులు",
  "dashboard.activeStaff": "యాక్టివ్ సిబ్బంది",
  "dashboard.revenue": "ఆదాయం (MTD)",
  "dashboard.coursesLive": "లైవ్ కోర్సులు",
  "settings.language": "భాష",
  "settings.selectLanguage": "మీ ఇష్టమైన భాషను ఎంచుకోండి",
};

const ALL_TRANSLATIONS: Record<SupportedLanguage, Record<string, string>> = {
  en: EN_TRANSLATIONS,
  hi: HI_TRANSLATIONS,
  mr: MR_TRANSLATIONS,
  ta: TA_TRANSLATIONS,
  te: TE_TRANSLATIONS,
};

export const useI18nStore = create<I18nState>()(
  persist(
    (set) => ({
      language: "en",
      translations: EN_TRANSLATIONS,
      setLanguage: (lang) => set({ language: lang, translations: ALL_TRANSLATIONS[lang] ?? EN_TRANSLATIONS }),
    }),
    { name: "eliteclass-i18n", partialize: (state) => ({ language: state.language }) as any }
  )
);

// Hook for easy translation access
export function useTranslation() {
  const { translations, language, setLanguage } = useI18nStore();

  function t(key: string, fallback?: string): string {
    return translations[key] ?? EN_TRANSLATIONS[key] ?? fallback ?? key;
  }

  return { t, language, setLanguage };
}

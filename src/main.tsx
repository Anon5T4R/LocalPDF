import ReactDOM from "react-dom/client";
import App from "./App";
import { initTheme } from "./lib/theme";
import { useLocale } from "./lib/i18n";

initTheme();

// Remonta a árvore ao trocar de idioma → todo t() reavalia.
function Root() {
  const locale = useLocale();
  return <App key={locale} />;
}

// Sem StrictMode (lição da suíte): efeitos duplicados disparam renders
// duplicados do pdf.js no mesmo canvas.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<Root />);

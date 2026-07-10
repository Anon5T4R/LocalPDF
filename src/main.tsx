import ReactDOM from "react-dom/client";
import App from "./App";

// Sem StrictMode (lição da suíte): efeitos duplicados disparam renders
// duplicados do pdf.js no mesmo canvas.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);

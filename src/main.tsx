
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./styles/mobile-container.css";
import "./styles/globals.css";

// Ionic core and basic CSS utilities
import "@ionic/react/css/core.css";
import "@ionic/react/css/normalize.css";
import "@ionic/react/css/structure.css";
import "@ionic/react/css/typography.css";
// Optional Ionic CSS utilities
import "@ionic/react/css/padding.css";
import "@ionic/react/css/float-elements.css";
import "@ionic/react/css/text-alignment.css";
import "@ionic/react/css/text-transformation.css";
import "@ionic/react/css/flex-utils.css";
import "@ionic/react/css/display.css";

import { setupIonicReact, IonApp } from "@ionic/react";
import MobileContainer from "./components/MobileContainer";

setupIonicReact();

createRoot(document.getElementById("root")!).render(
  <IonApp>
    <MobileContainer>
      <App />
    </MobileContainer>
  </IonApp>
);
  
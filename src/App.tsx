import { ChatOverlay } from "./renderer/ChatOverlay";
import TestPage from "./renderer/TestPage";
import BuilderPage from "./renderer/BuilderPage";
import Landing from "./Landing";
import "./App.css";

function App() {
  const path = window.location.pathname;

  // /builder route — visual URL builder for the /chat overlay
  if (path === "/builder") {
    return <BuilderPage />;
  }

  // /test route renders a test page with canned messages covering all render paths
  if (path === "/test") {
    return <TestPage />;
  }

  // /chat route renders the OBS overlay — no landing page CSS
  if (path === "/chat") {
    return <ChatOverlay />;
  }

  // Landing page loads its own CSS
  return <Landing />;
}

export default App;

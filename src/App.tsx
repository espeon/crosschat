import { ChatOverlay } from "./renderer/ChatOverlay";
import TestPage from "./renderer/TestPage";
import Landing from "./Landing";
import "./App.css";

function App() {
  const path = window.location.pathname;

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

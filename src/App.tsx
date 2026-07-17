import { ChatOverlay } from "./renderer/ChatOverlay";
import Landing from "./Landing";
import "./App.css";

function App() {
  const path = window.location.pathname;

  // /chat route renders the OBS overlay — no landing page CSS
  if (path === "/chat") {
    return <ChatOverlay />;
  }

  // Landing page loads its own CSS
  return <Landing />;
}

export default App;

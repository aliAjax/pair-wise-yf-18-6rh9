import { StoreProvider } from "./state/store";
import Pages from "./ui/pages";

function App() {
  return (
    <StoreProvider>
      <Pages />
    </StoreProvider>
  );
}

export default App;

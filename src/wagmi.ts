import { fallback, http } from "viem";
import { base, bsc, mainnet } from "viem/chains";
import { createConfig } from "wagmi";
import { injected } from "wagmi/connectors";

const ETHEREUM_RPC_URLS = [
  import.meta.env.VITE_ETHEREUM_RPC_URL,
  "https://ethereum-rpc.publicnode.com",
  "https://1rpc.io/eth",
  "https://rpc.flashbots.net",
  "https://eth.drpc.org",
].filter((url): url is string => typeof url === "string" && url.length > 0);

const BASE_RPC_URLS = [
  import.meta.env.VITE_BASE_RPC_URL,
  "https://mainnet.base.org",
  "https://base-rpc.publicnode.com",
  "https://1rpc.io/base",
].filter((url): url is string => typeof url === "string" && url.length > 0);

const BSC_RPC_URLS = [
  import.meta.env.VITE_BSC_RPC_URL,
  "https://bsc-dataseed.binance.org",
  "https://bsc-rpc.publicnode.com",
  "https://1rpc.io/bnb",
  "https://bsc.drpc.org",
].filter((url): url is string => typeof url === "string" && url.length > 0);

function rpcFallback(urls: readonly string[]) {
  return fallback(
    urls.map((url) => http(url, { retryCount: 1, timeout: 8_000 })),
    { retryCount: 1 },
  );
}

export const wagmiConfig = createConfig({
  chains: [mainnet, base, bsc],
  connectors: [injected()],
  ssr: false,
  transports: {
    [mainnet.id]: rpcFallback(ETHEREUM_RPC_URLS),
    [base.id]: rpcFallback(BASE_RPC_URLS),
    [bsc.id]: rpcFallback(BSC_RPC_URLS),
  },
});

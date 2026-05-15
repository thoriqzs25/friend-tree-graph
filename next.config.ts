import type { NextConfig } from "next";
import path from "path";
import { execSync } from "child_process";

function getCommitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["pipe", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
}

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  env: {
    NEXT_PUBLIC_COMMIT_SHA: getCommitSha(),
  },
};

export default nextConfig;

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

type ConfigSection = "bridge" | "server";
type LocalConfig = Partial<Record<ConfigSection, Record<string, unknown>>>;

export type ConfigSources = {
  env: NodeJS.ProcessEnv;
  dotEnv: Record<string, string>;
  local: LocalConfig;
};

const defaultLocalConfigFile = "codexproxy.local.json";

export function loadConfigSources(env = process.env, cwd = process.cwd()): ConfigSources {
  return {
    env,
    dotEnv: readDotEnv(cwd),
    local: readLocalConfig(env.CODEXPROXY_CONFIG, cwd)
  };
}

export function getString(
  sources: ConfigSources,
  section: ConfigSection,
  envName: string,
  localName: string,
  fallback?: string
): string | undefined {
  const value = getValue(sources, section, envName, localName);
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  throw new Error(`${section}.${localName} must be a string.`);
}

export function getNumber(
  sources: ConfigSources,
  section: ConfigSection,
  envName: string,
  localName: string,
  fallback: number
): number {
  const value = getValue(sources, section, envName, localName);
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(`${section}.${localName} must be a number.`);
  }
  return numberValue;
}

export function getBoolean(
  sources: ConfigSources,
  section: ConfigSection,
  envName: string,
  localName: string,
  fallback: boolean
): boolean {
  const value = getValue(sources, section, envName, localName);
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }
  throw new Error(`${section}.${localName} must be a boolean.`);
}

function getValue(
  sources: ConfigSources,
  section: ConfigSection,
  envName: string,
  localName: string
): unknown {
  if (Object.prototype.hasOwnProperty.call(sources.env, envName)) {
    return sources.env[envName];
  }

  const localSection = sources.local[section];
  if (localSection && Object.prototype.hasOwnProperty.call(localSection, localName)) {
    return localSection[localName];
  }

  if (Object.prototype.hasOwnProperty.call(sources.dotEnv, envName)) {
    return sources.dotEnv[envName];
  }

  return undefined;
}

function readDotEnv(cwd: string): Record<string, string> {
  const dotEnvPath = path.join(cwd, ".env");
  if (!existsSync(dotEnvPath)) {
    return {};
  }
  return dotenv.parse(readFileSync(dotEnvPath));
}

function readLocalConfig(configPath: string | undefined, cwd: string): LocalConfig {
  const resolvedPath = configPath
    ? path.resolve(cwd, configPath)
    : path.join(cwd, defaultLocalConfigFile);
  if (!existsSync(resolvedPath)) {
    return {};
  }

  const parsed = JSON.parse(readFileSync(resolvedPath, "utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${resolvedPath} must contain a JSON object.`);
  }
  return parsed as LocalConfig;
}

// SocialHub Engineer (lokal di VM Office). Mesin: Claude Code.
import os from "node:os"; import path from "node:path"; import { makeEngineer } from "./engineer-generic.js";
export const engineer = makeEngineer({ id: "engineer-socialhub", platform: "SocialHub", cwd: process.env.ENGINEER_SOCIALHUB_WORKDIR || path.join(os.homedir(), "socialhub") });

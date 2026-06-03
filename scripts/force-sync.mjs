import "dotenv/config";
import { getSalesforceSession, runSoqlQuery } from "./salesforce-utils.mjs";
import fs from "fs";

// Import the sync script but since it executes on load, maybe it's better to modify the sync script to accept --auto

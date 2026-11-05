import { ensureAuthenticated } from "./auth-session.js";
import { initializeNavigation } from "./navigation.js";
if (await ensureAuthenticated()) initializeNavigation();

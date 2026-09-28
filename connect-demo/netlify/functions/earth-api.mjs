// -----------------------------------------------------------------------------
// LiveEarth "fresh satellite photo" API: https://<your-site>/earth/api/*
//
// Lives here only because Netlify allows one functions directory per site and
// the Connect demo already owns it; it shares no code with the demo. Logic is
// in earth/api/skyfi.mjs so it can be tested without Netlify.
// -----------------------------------------------------------------------------
import { handleRequest } from "../../../earth/api/skyfi.mjs";

export default (request) => handleRequest(request, process.env);

export const config = { path: "/earth/api/*" };

/**
 * These are tools from Panth977, who has certain design principles in coding! This makes his life in coding very very easy! 🎉
 * @module
 *
 * @example
 * ```ts
 * import { TOOLS } from "@panth977/tools";
 *
 * TOOLS.{api}
 * ```
 */


import * as basic from "./basic.ts";
import * as operation from "./operation.ts";
import * as structure from "./structure.ts";
import * as scheduler from "./scheduler.ts";
import * as encode from "./encode.ts";

/**
 * @namespace TOOLS
 * @description Collection of utility functions and constants related to various tools.
 */ export const TOOLS = {
    ...basic,
    ...operation,
    ...structure,
    ...scheduler,
    ...encode,
};
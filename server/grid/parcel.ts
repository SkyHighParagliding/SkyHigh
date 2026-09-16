/**
 * Thermodynamic parcel routines — moved to shared/parcel.ts so the client SkewT
 * can recompute the parcel ascent live (draggable trigger temperature). This
 * shim keeps existing server imports (`../parcel.js`) working unchanged.
 */
export * from "../../shared/parcel.js";

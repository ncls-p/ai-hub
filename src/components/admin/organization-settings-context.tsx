"use client";
import { createContext, useContext } from "react";
export const OrganizationSettingsContext = createContext<string | null>(null);
export const useSettingsOrganizationId = () =>
  useContext(OrganizationSettingsContext);

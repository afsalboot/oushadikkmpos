"use client";
import { createContext, useContext } from 'react';
export const SalesCacheContext = createContext(null);
export const useSalesCacheScope = () => useContext(SalesCacheContext);

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AuthProvider } from './services/auth';
import { ensureSeed } from './services/seed';
import './index.css';
ensureSeed();
const qc = new QueryClient();
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><QueryClientProvider client={qc}><AuthProvider><BrowserRouter><App /></BrowserRouter></AuthProvider></QueryClientProvider></React.StrictMode>
);

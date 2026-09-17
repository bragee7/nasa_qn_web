import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './services/auth';
import { ensureSeed } from './services/seed';
import './index.css';
ensureSeed();
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><AuthProvider><BrowserRouter><App /></BrowserRouter></AuthProvider></React.StrictMode>
);

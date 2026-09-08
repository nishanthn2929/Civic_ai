import axios from 'axios';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authService = {
  login: async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    if (res.data.access_token) {
      localStorage.setItem('token', res.data.access_token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
    }
    return res.data;
  },
  register: async (userData) => {
    const res = await api.post('/auth/register', userData);
    if (res.data.access_token) {
      localStorage.setItem('token', res.data.access_token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
    }
    return res.data;
  },
  getMe: async () => {
    const res = await api.get('/auth/me');
    return res.data;
  },
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },
  getCurrentUser: () => {
    const u = localStorage.getItem('user');
    return u ? JSON.parse(u) : null;
  }
};

export const citizenService = {
  prescreen: async (formData) => {
    const res = await api.post('/reports/prescreen', formData);
    return res.data;
  },
  reverseGeocode: async (lat, lng) => {
    const res = await api.get('/reports/reverse-geocode', {
      params: { latitude: lat, longitude: lng }
    });
    return res.data;
  },
  searchLocation: async (query) => {
    const res = await api.get('/reports/search-location', {
      params: { q: query }
    });
    return res.data?.results || [];
  },
  createReport: async (formData) => {
    const res = await api.post('/reports/create', formData);
    return res.data;
  },
  getMyReports: async () => {
    const res = await api.get('/reports/my');
    return res.data;
  },
  parseVoice: async (payload) => {
    const res = await api.post('/voice/parse', payload);
    return res.data;
  },
  startDrive: async (lat, lng) => {
    const res = await api.post('/drive/sessions/start', { latitude: lat, longitude: lng });
    return res.data;
  },
  endDrive: async (sessionId, distanceKm) => {
    const res = await api.post('/drive/sessions/end', { session_id: sessionId, distance_km: distanceKm });
    return res.data;
  },
  processFrame: async (payload) => {
    const res = await api.post('/drive/process-frame', payload);
    return res.data;
  },
  getWardSourceInfo: async () => {
    const res = await api.get('/reports/ward-source-info');
    return res.data;
  },
  verifyResolution: async (incidentId, verified, feedback) => {
    const res = await api.post(`/incidents/${incidentId}/citizen-verify`, {
      verified,
      feedback
    });
    return res.data;
  }
};

export const authorityService = {
  getMetrics: async () => {
    const res = await api.get('/authority/metrics');
    return res.data;
  },
  getIncidents: async (filters = {}) => {
    const res = await api.get('/incidents', { params: filters });
    return res.data;
  },
  getIncidentDetail: async (id) => {
    const res = await api.get(`/incidents/${id}`);
    return res.data;
  },
  assignIncident: async (id, officerId, instructions) => {
    const res = await api.post(`/authority/incidents/${id}/assign`, {
      officer_id: officerId,
      instructions
    });
    return res.data;
  },
  updateStatus: async (id, newStatus, comment) => {
    const res = await api.post(`/authority/incidents/${id}/status`, {
      new_status: newStatus,
      comment
    });
    return res.data;
  },
  resolveIncident: async (id, formData) => {
    const res = await api.post(`/authority/incidents/${id}/resolve`, formData);
    return res.data;
  }
};

export const publicService = {
  getStats: async () => {
    const res = await api.get('/public/stats');
    return res.data;
  },
  getMapIncidents: async () => {
    const res = await api.get('/public/map-incidents');
    return res.data;
  },
  getWardGeoJson: async () => {
    const res = await api.get('/public/ward-geojson');
    return res.data;
  }
};

export const adminService = {
  getSettings: async () => {
    const res = await api.get('/admin/settings');
    return res.data;
  },
  updateSetting: async (key, value, description) => {
    const res = await api.post('/admin/settings', { key, value, description });
    return res.data;
  },
  getUsers: async () => {
    const res = await api.get('/admin/users');
    return res.data;
  },
  changeRole: async (userId, newRole, deptId, wardId) => {
    const res = await api.post(`/admin/users/${userId}/role`, null, {
      params: { new_role: newRole, department_id: deptId, ward_id: wardId }
    });
    return res.data;
  },
  getAuditLogs: async () => {
    const res = await api.get('/admin/audit-logs');
    return res.data;
  },
  getHandoffPackage: async (incidentId) => {
    const res = await api.get(`/admin/government-handoff/${incidentId}`);
    return res.data;
  },
  getWardDatasetInfo: async () => {
    const res = await api.get('/admin/wards/dataset-info');
    return res.data;
  },
  getWardGeoJson: async () => {
    const res = await api.get('/admin/wards/geojson');
    return res.data;
  },
  searchWards: async (q) => {
    const res = await api.get('/admin/wards/search', { params: { q } });
    return res.data?.results || [];
  },
  detectWard: async (lat, lon) => {
    const res = await api.post('/admin/wards/detect', { latitude: lat, longitude: lon });
    return res.data;
  },
  validateWardDataset: async (formData) => {
    const res = await api.post('/admin/wards/validate', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return res.data;
  },
  importWardDataset: async (formData) => {
    const res = await api.post('/admin/wards/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return res.data;
  },
  getWardBackups: async () => {
    const res = await api.get('/admin/wards/backups');
    return res.data?.backups || [];
  }
};

export default api;

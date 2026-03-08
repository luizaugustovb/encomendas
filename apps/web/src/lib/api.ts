const API_URL = '/api';

interface FetchOptions extends RequestInit {
  token?: string;
}

async function fetchApi(endpoint: string, options: FetchOptions = {}) {
  const { token, ...fetchOptions } = options;

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  // Only set Content-Type to JSON if body is a string (not FormData)
  if (!options.body || typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${endpoint}`, {
    ...fetchOptions,
    headers,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Erro desconhecido' }));
    throw new Error(error.message || `HTTP ${res.status}`);
  }

  if (res.headers.get('content-type')?.includes('application/pdf')) {
    return res.blob();
  }

  return res.json();
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    fetchApi('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (data: any) =>
    fetchApi('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  getProfile: (token: string) =>
    fetchApi('/auth/profile', { token }),

  // Dashboard
  getDashboardStats: (token: string) =>
    fetchApi('/deliveries/dashboard', { token }),

  // Deliveries
  getDeliveries: (token: string) =>
    fetchApi('/deliveries', { token }),
  getDelivery: (id: string, token: string) =>
    fetchApi(`/deliveries/${id}`, { token }),
  openDoor: (token: string, doorNo: number = 1) =>
    fetchApi('/hikvision/admin/door/open', { method: 'POST', body: JSON.stringify({ doorNo }), token }),
  createDelivery: (data: any, token: string) => {
    const formData = new FormData();
    formData.append('userId', data.userId);
    formData.append('locationId', data.locationId);
    if (data.unitId) formData.append('unitId', data.unitId);
    if (data.description) formData.append('description', data.description);
    if (data.tenantId) formData.append('tenantId', data.tenantId);
    if (data.photo) formData.append('photo', data.photo);
    return fetchApi('/deliveries', { method: 'POST', body: formData, token });
  },
  withdrawDelivery: (data: { userId: string; qrcode: string }, token: string) =>
    fetchApi('/deliveries/withdraw', { method: 'POST', body: JSON.stringify(data), token }),
  getDeliveryLabel: (id: string, token: string, format: 'a4' | 'thermal' | 'sticker' = 'a4') =>
    fetch(`${API_URL}/deliveries/${id}/label?format=${format}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.blob()),
  sendWhatsapp: (id: string, token: string) =>
    fetchApi(`/deliveries/${id}/whatsapp`, { method: 'POST', token }),

  // Users
  getUsers: (token: string, tenantId?: string) =>
    fetchApi(`/users${tenantId ? `?tenantId=${tenantId}` : ''}`, { token }),
  getUser: (id: string, token: string) =>
    fetchApi(`/users/${id}`, { token }),
  createUser: (data: any, token: string) =>
    fetchApi('/users', { method: 'POST', body: JSON.stringify(data), token }),
  updateUser: (id: string, data: any, token: string) =>
    fetchApi(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data), token }),
  deleteUser: (id: string, token: string) =>
    fetchApi(`/users/${id}`, { method: 'DELETE', token }),
  reactivateUser: (id: string, token: string) =>
    fetchApi(`/users/${id}/reactivate`, { method: 'PATCH', token }),
  permanentDeleteUser: (id: string, token: string) =>
    fetchApi(`/users/${id}/permanent`, { method: 'DELETE', token }),
  uploadUserPhoto: (id: string, file: File, token: string) => {
    const formData = new FormData();
    formData.append('photo', file);
    return fetchApi(`/users/${id}/photo`, { method: 'POST', body: formData, token });
  },

  // Units
  getUnits: (token: string, tenantId?: string) =>
    fetchApi(`/units${tenantId ? `?tenantId=${tenantId}` : ''}`, { token }),
  createUnit: (data: any, token: string) =>
    fetchApi('/units', { method: 'POST', body: JSON.stringify(data), token }),
  updateUnit: (id: string, data: any, token: string) =>
    fetchApi(`/units/${id}`, { method: 'PUT', body: JSON.stringify(data), token }),
  deleteUnit: (id: string, token: string) =>
    fetchApi(`/units/${id}`, { method: 'DELETE', token }),

  // Locations
  getLocations: (token: string) =>
    fetchApi('/locations', { token }),
  createLocation: (data: any, token: string) =>
    fetchApi('/locations', { method: 'POST', body: JSON.stringify(data), token }),
  updateLocation: (id: string, data: any, token: string) =>
    fetchApi(`/locations/${id}`, { method: 'PUT', body: JSON.stringify(data), token }),
  deleteLocation: (id: string, token: string) =>
    fetchApi(`/locations/${id}`, { method: 'DELETE', token }),

  // Tenants
  getTenants: (token: string) =>
    fetchApi('/tenants', { token }),
  createTenant: (data: any, token: string) =>
    fetchApi('/tenants', { method: 'POST', body: JSON.stringify(data), token }),
  updateTenant: (id: string, data: any, token: string) =>
    fetchApi(`/tenants/${id}`, { method: 'PUT', body: JSON.stringify(data), token }),
  deleteTenant: (id: string, token: string) =>
    fetchApi(`/tenants/${id}`, { method: 'DELETE', token }),
  reactivateTenant: (id: string, token: string) =>
    fetchApi(`/tenants/${id}/reactivate`, { method: 'PATCH', token }),
  permanentDeleteTenant: (id: string, token: string) =>
    fetchApi(`/tenants/${id}/permanent`, { method: 'DELETE', token }),

  // Tenant Config
  getTenantConfig: (token: string, tenantId?: string) =>
    fetchApi(tenantId ? `/tenant-config/${tenantId}` : '/tenant-config', { token }),
  updateTenantConfig: (data: any, token: string, tenantId?: string) =>
    fetchApi(tenantId ? `/tenant-config/${tenantId}` : '/tenant-config', { method: 'PUT', body: JSON.stringify(data), token }),
  testWhatsapp: (phone: string, token: string) =>
    fetchApi('/tenant-config/test/whatsapp', { method: 'POST', body: JSON.stringify({ phone }), token }),
  testHikvision: (token: string, tenantId?: string) =>
    fetchApi('/tenant-config/test/hikvision', { method: 'POST', body: JSON.stringify({ tenantId }), token }),

  // Totem (público - sem prefixo /api)
  totemFindByCode: (code: string) =>
    fetch(`/totem-api/delivery/${encodeURIComponent(code)}`).then(async (r) => {
      if (!r.ok) {
        const err = await r.json().catch(() => ({ message: 'Erro desconhecido' }));
        throw new Error(err.message || `HTTP ${r.status}`);
      }
      return r.json();
    }),
  totemGetResidents: (code: string) =>
    fetch(`/totem-api/delivery/${encodeURIComponent(code)}/residents`).then(async (r) => {
      if (!r.ok) {
        const err = await r.json().catch(() => ({ message: 'Erro desconhecido' }));
        throw new Error(err.message || `HTTP ${r.status}`);
      }
      return r.json();
    }),
  totemWithdraw: (code: string, photos: File[] = [], withdrawnById?: string) => {
    const formData = new FormData();
    formData.append('code', code);
    photos.forEach((photo) => formData.append('photos', photo));
    if (withdrawnById) formData.append('withdrawnById', withdrawnById);
    return fetch('/totem-api/withdraw', { method: 'POST', body: formData }).then(async (r) => {
      if (!r.ok) {
        const err = await r.json().catch(() => ({ message: 'Erro desconhecido' }));
        throw new Error(err.message || `HTTP ${r.status}`);
      }
      return r.json();
    });
  },

  // Audit Logs
  getAuditLogs: (token: string, filters?: { deliveryId?: string; type?: string; from?: string; to?: string; unitId?: string }) => {
    const params = new URLSearchParams();
    if (filters?.deliveryId) params.append('deliveryId', filters.deliveryId);
    if (filters?.type) params.append('type', filters.type);
    if (filters?.from) params.append('from', filters.from);
    if (filters?.to) params.append('to', filters.to);
    if (filters?.unitId) params.append('unitId', filters.unitId);
    const qs = params.toString();
    return fetchApi(`/deliveries/audit/logs${qs ? `?${qs}` : ''}`, { token });
  },

  // Equipment
  getEquipments: (token: string) =>
    fetchApi('/equipment', { token }),
  getEquipmentStatus: (token: string) =>
    fetchApi('/equipment/status', { token }),
  getEquipment: (id: string, token: string) =>
    fetchApi(`/equipment/${id}`, { token }),
  createEquipment: (data: any, token: string) =>
    fetchApi('/equipment', { method: 'POST', body: JSON.stringify(data), token }),
  updateEquipment: (id: string, data: any, token: string) =>
    fetchApi(`/equipment/${id}`, { method: 'PUT', body: JSON.stringify(data), token }),
  deleteEquipment: (id: string, token: string) =>
    fetchApi(`/equipment/${id}`, { method: 'DELETE', token }),
  checkEquipmentOnline: (id: string, token: string) =>
    fetchApi(`/equipment/${id}/status`, { token }),
  openEquipmentDoor: (id: string, doorNo: number, token: string) =>
    fetchApi(`/equipment/${id}/door/open`, { method: 'POST', body: JSON.stringify({ doorNo }), token }),
  testEquipmentConnection: (id: string, token: string) =>
    fetchApi(`/equipment/${id}/test`, { method: 'POST', token }),

  // Totem RTSP Config (público)
  totemGetRtspConfig: (tenantId: string) =>
    fetch(`/totem-api/config/${encodeURIComponent(tenantId)}/rtsp`).then(async (r) => {
      if (!r.ok) return { rtspCameraUrl: null };
      return r.json();
    }),
};

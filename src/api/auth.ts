import { apiRequest } from './client'
import type { components, operations } from './schema'

type Schemas = components['schemas']

export type Me = Schemas['Me']
type TokenBody = operations['api_authlogin_post']['responses'][200]['content']['application/json']
type TwoFactorBody =
  operations['api_authlogin_post']['responses'][202]['content']['application/json']

export type LoginResult =
  | { kind: 'token'; token: string }
  | { kind: 'twoFactor'; twoFactorToken: string; expiresIn: number }

export type ResendCodeRequest = Schemas['ResendCode']

export const authApi = {
  register: (body: Schemas['Register']) =>
    apiRequest<Schemas['Register.RegisteredUser']>('/auth/register', { method: 'POST', body }),

  verifyEmail: (body: Schemas['VerifyEmail']) =>
    apiRequest<void>('/auth/verify-email', { method: 'POST', body }),

  resendCode: (body: ResendCodeRequest) =>
    apiRequest<void>('/auth/resend-code', { method: 'POST', body }),

  async login(body: Schemas['Login']): Promise<LoginResult> {
    const { status, data } = await apiRequest<TokenBody | TwoFactorBody>('/auth/login', {
      method: 'POST',
      body,
    })
    if (status === 202) {
      const pending = data as TwoFactorBody
      return {
        kind: 'twoFactor',
        twoFactorToken: pending.twoFactorToken,
        expiresIn: pending.expiresIn,
      }
    }
    return { kind: 'token', token: (data as TokenBody).token }
  },

  async twoFactor(body: Schemas['TwoFactorLogin']): Promise<string> {
    const { data } = await apiRequest<TokenBody>('/auth/2fa', { method: 'POST', body })
    return data.token
  },

  logout: () => apiRequest<void>('/auth/logout', { method: 'POST' }),

  me: () => apiRequest<Me>('/me'),

  setLocale: (body: Schemas['Me.LocaleSettings']) =>
    apiRequest<Me>('/me/locale', { method: 'PUT', body }),

  setTheme: (body: Schemas['Me.ThemeSettings']) =>
    apiRequest<Me>('/me/theme', { method: 'PUT', body }),
  setTwoFactor: (body: Schemas['Me.TwoFactorSettings.jsonMergePatch']) =>
    apiRequest<Me>('/me/two-factor', {
      method: 'PATCH',
      body,
      contentType: 'application/merge-patch+json',
    }),
}

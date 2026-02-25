# Google OAuth (Sign in with Google)

The app shows a **Continue with Google** button on the login page. To make it work, you need to enable the Google provider in Supabase and create OAuth credentials in Google Cloud.

---

## 1. Google Cloud Console

### 1.1 OAuth consent screen (if prompted)

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project or select an existing one.
3. **APIs & Services** → **OAuth consent screen**.
4. User type: **External** (or Internal for workspace-only).
5. App name: e.g. **Leadflow Vloom**; support email and developer contact → Save.
6. **Authorized domains (Dominios autorizados):**
   - Do **not** use `http://` or `https://`. Use only the domain.
   - For local dev add: **`localhost`** (just that word, no scheme, no port).
   - For production add: **`yourdomain.com`** (no `https://`).
   - If you see "Dominio no válido: No debe especificar el esquema", remove `http://` and `https://` and use only `localhost` or the domain name.

### 1.2 OAuth client ID – where to set origins and redirect URLs

**Authorized JavaScript origins** and **Authorized redirect URIs** are **not** on the "Información de la marca" (Brand information) page. They are in the **OAuth client** (Credentials).

1. In Google Cloud, open **APIs & Services** (APIs y servicios) in the left menu.
2. Click **Credentials** (**Credenciales**).
3. Under "OAuth 2.0 Client IDs", either:
   - Click **+ Create credentials** (**+ Crear credenciales**) → **OAuth client ID** (**ID de cliente de OAuth**), or  
   - Click the **name** of an existing OAuth 2.0 Client ID to edit it.
4. In the form you will see:
   - **Application type** (Tipo de aplicación): choose **Web application** (Aplicación web).
   - **Name** (Nombre): e.g. **Leadflow Vloom Web**.
   - **Authorized JavaScript origins** (Orígenes de JavaScript autorizados):  
     Add the full URLs here, e.g. `http://localhost:5173` and your production URL.
   - **Authorized redirect URIs** (URI de redirección autorizados):  
     Add the Supabase callback URL (from Supabase → Authentication → Providers → Google).
5. Save. Copy the **Client ID** and **Client secret** to use in Supabase.

---

## 2. Supabase Dashboard

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → your project.
2. **Authentication** → **Providers**.
3. Find **Google** and turn it **ON**.
4. Paste the **Client ID** and **Client secret** from Google Cloud.
5. Save.

---

## 3. Redirect URL (Supabase)

1. In Supabase: **Authentication** → **URL Configuration**.
2. Under **Redirect URLs**, add the URLs where your app runs:
   - `http://localhost:5173` (local)
   - Your production URL, e.g. `https://your-app.vercel.app`
3. Save.

The **Site URL** (e.g. `http://localhost:5173`) is where users are sent after signing in with Google.

---

## 4. Test

1. Run `npm run dev` and open the app.
2. Click **Continue with Google**.
3. You should be redirected to Google, then back to the app and signed in.

If you see “redirect_uri_mismatch”, the redirect URI in Google Cloud must match exactly what Supabase uses: **Authentication** → **Providers** → **Google** shows the callback URL to add in Google Cloud under **Authorized redirect URIs**.

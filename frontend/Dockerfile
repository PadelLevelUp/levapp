FROM node:20-alpine AS build
WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
RUN npm ci

# Copy the rest of the repo (includes apps/ and any future packages/)
COPY . .

ENV VITE_USE_MOCK_DATA=false
# PAD-469: the landing page's HubSpot demo form ID (public). Empty = mailto.
ARG VITE_HUBSPOT_DEMO_FORM_ID=""
ENV VITE_HUBSPOT_DEMO_FORM_ID=$VITE_HUBSPOT_DEMO_FORM_ID

RUN npm run build -w @levelup/web

FROM nginx:1.27-alpine

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

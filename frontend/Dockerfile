FROM node:22-alpine AS build
WORKDIR /app/frontend
COPY package.json ./
RUN npm install
COPY . .
ARG VITE_API_URL=
ARG VITE_ADMIN_IDS=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_ADMIN_IDS=$VITE_ADMIN_IDS
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/webapp /usr/share/nginx/html
EXPOSE 80

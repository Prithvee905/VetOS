FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG API_ORIGIN=http://api:8080
ARG GIT_COMMIT=unknown
ENV API_ORIGIN=$API_ORIGIN
ENV NEXT_PUBLIC_BUILD_SHA=$GIT_COMMIT
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000
COPY --from=build /src/.next/standalone ./
COPY --from=build /src/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]

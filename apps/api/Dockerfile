FROM eclipse-temurin:21-jre
WORKDIR /app
RUN useradd --system --uid 10001 vetos && mkdir -p /app/.vetos-blobs && chown -R vetos:vetos /app
USER vetos
COPY --chown=vetos:vetos target/vetos-api-*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]

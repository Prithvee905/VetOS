FROM eclipse-temurin:21-jre
WORKDIR /app
RUN useradd --system --uid 10001 vetos
USER vetos
COPY target/vetos-api-*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]

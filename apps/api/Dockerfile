FROM eclipse-temurin:21-jdk AS build
WORKDIR /src
COPY . .
RUN chmod +x mvnw && ./mvnw -B -DskipTests -Djava.net.preferIPv4Stack=true package

FROM eclipse-temurin:21-jre
WORKDIR /app
RUN useradd --system --uid 10001 vetos
USER vetos
COPY --from=build /src/target/vetos-api-*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]

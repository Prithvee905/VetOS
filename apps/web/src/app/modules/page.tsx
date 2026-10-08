export default function ModulesPage() {
  return (
    <div className="prose prose-slate max-w-none">
      <p>
        API coverage for the clinic platform. Use{" "}
        <a className="text-teal-700" href="http://localhost:8080/swagger-ui.html" target="_blank" rel="noreferrer">
          Swagger UI
        </a>{" "}
        when the API is running.
      </p>
      <ul>
        <li>Clinic workflow — clients, pets, appointments, queue, consult, Rx, invoice, payment</li>
        <li>Leads, vaccinations, products, vendors, inventory, expenses</li>
        <li>Lab orders, surgery, IPD, grooming (record APIs)</li>
        <li>Export jobs and outbox (async workers not bundled)</li>
      </ul>
      <p className="text-sm text-slate-600">
        See <code>docs/product-scope.md</code> for what still needs WhatsApp, email, S3, and AWS deployment.
      </p>
    </div>
  );
}

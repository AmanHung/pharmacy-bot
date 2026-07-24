const { createApplication } = require('./src/bootstrap');

const app = createApplication();

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Pharmacy bot is listening on port ${port}`);
  });
}

module.exports = app;

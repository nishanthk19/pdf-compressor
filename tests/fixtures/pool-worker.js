process.on("message", ({ args }) => {
  setTimeout(() => process.send({ result: args[0] }), args[1]);
});

const { expect } = require("chai");
const { Given, When, Then } = require("./mocha-gherkin.spec");
const Hyperjump = require(".");
const nock = require("nock");


Given("a JSON Reference document", () => {
  let doc;
  let aaa;
  let ccc;

  before(async () => {
    const exampleUrl = "http://json-reference.hyperjump.io/entries/example1";
    nock("http://json-reference.hyperjump.io")
      .get("/entries/example1")
      .reply(200, {
        "aaa": 111,
        "bbb": { "$href": "#/aaa" },
        "ccc": 333
      }, { "Content-Type": "application/reference+json" });

    doc = await Hyperjump.get(exampleUrl, Hyperjump.nil);
    aaa = await Hyperjump.get("#/aaa", doc);
    ccc = await Hyperjump.get("#/ccc", doc);
  });

  after(nock.cleanAll);

  When("getting the entries for a document whose value is an object", () => {
    let subject;

    before(async () => {
      subject = await Hyperjump.entries(doc);
    });

    Then("the values should be documents", async () => {
      expect(subject).to.eql([["aaa", aaa], ["bbb", aaa], ["ccc", ccc]]);
    });
  });

  When("getting entries of an object whose values are documents", () => {
    let subject;

    before(async () => {
      subject = await Hyperjump.entries({
        "aaa": aaa,
        "bbb": aaa,
        "ccc": ccc
      });
    });

    Then("the values should be documents", async () => {
      expect(subject).to.eql([["aaa", aaa], ["bbb", aaa], ["ccc", ccc]]);
    });
  });

  When("getting entries of a normal object", () => {
    let subject;

    before(async () => {
      subject = await Hyperjump.entries({
        "aaa": 111,
        "bbb": 111,
        "ccc": 333
      });
    });

    Then("the values should normal values", async () => {
      expect(subject).to.eql([["aaa", 111], ["bbb", 111], ["ccc", 333]]);
    });
  });
});
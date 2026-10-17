# End User License Agreement and Terms of Use

**Effective date:** October 17, 2026

These terms apply to **whoop-mcp** (the "Software"): the open-source software at [github.com/oryanomer1/whoop-mcp](https://github.com/oryanomer1/whoop-mcp), published on npm as `@oryanomer/whoop-mcp` and distributed through directories such as the MCP Registry, Smithery and Glama. The Software is maintained by Oryan Omer (the "Maintainer") as an independent project.

By installing or using the Software, you agree to these terms. If you do not agree, do not install or use it.

## 1. License

The Software is licensed under the [MIT License](LICENSE). These terms do not restrict any right the MIT License grants you to use, copy, modify, merge, publish, distribute, sublicense or sell copies of the Software. If these terms and the MIT License conflict, the MIT License governs your rights in the Software itself. These terms add rules for **using the Software with WHOOP data** and explain what the Software does and does not do.

Third-party components the Software depends on (listed in `package.json` and `package-lock.json`) are licensed by their own authors under their own licenses.

## 2. Your WHOOP account and developer app

To use the Software you need your own WHOOP membership and your own WHOOP developer app. You are responsible for:

- complying with the [WHOOP API Terms of Use](https://developer.whoop.com/api-terms-of-use/) and the [WHOOP Terms of Use](https://www.whoop.com/termsofuse), including any usage limits WHOOP sets;
- connecting only WHOOP accounts that you own or are authorized to access;
- keeping your app's client secret and the stored tokens confidential.

WHOOP may change, limit or revoke access to its API at any time. The Maintainer does not control WHOOP's services and cannot guarantee their availability.

## 3. What the Software does

The Software runs on your computer, reads your WHOOP data through WHOOP's official API, and returns it to the Model Context Protocol (MCP) client you connect it to. It is designed to be **read-only**: it requests only read permissions and does not create, change or delete data in your WHOOP account. How it handles your data is described in the [Privacy Policy](PRIVACY.md).

## 4. Your MCP client and AI providers

Data returned by the Software is passed to the MCP client you choose, and usually on to that client's AI model provider. Their use of your data is governed by their own terms and privacy policies, not by these terms. You are responsible for choosing a client and provider you trust with health information.

Answers produced by an AI assistant from your data can be incomplete or wrong. Check important information against the WHOOP app.

## 5. Not medical advice

The Software is not a medical device and does not provide medical advice, diagnosis or treatment. Recovery, sleep, strain, heart-rate and other figures, and anything an AI assistant says about them, are for general information only. Consult a qualified health professional about any medical question, and never ignore professional advice or delay seeking it because of something produced with the Software. In an emergency, contact your local emergency services.

## 6. Acceptable use

You agree not to use the Software to:

- access anyone's WHOOP data without their authorization;
- violate any law, or WHOOP's terms, including by circumventing WHOOP's rate limits or access controls;
- misrepresent the Software as an official WHOOP product.

## 7. Trademarks and affiliation

The Software is unofficial. It is not affiliated with, endorsed by or sponsored by WHOOP, Inc. "WHOOP" is a trademark of WHOOP, Inc. Other product names, such as Claude, Cursor and Visual Studio Code, belong to their respective owners and are used only to describe compatibility.

## 8. No warranty

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, ACCURACY AND NONINFRINGEMENT. The Maintainer does not warrant that the Software will be uninterrupted or error-free, that WHOOP's API will remain available, or that data returned through the Software is accurate or complete.

## 9. Limitation of liability

TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL THE MAINTAINER OR CONTRIBUTORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE. This includes, without limitation, any loss of data, any decision you make about your health or training, any action WHOOP takes regarding your account or developer app, and any processing of your data by your MCP client or AI provider.

## 10. Stopping use

You can stop using the Software at any time: run `whoop-mcp logout` to delete the locally stored credentials, remove it from your MCP client, and optionally delete your WHOOP developer app. Sections 5, 8 and 9 continue to apply to your past use.

## 11. Changes to these terms

Changes are published in this file in the project's GitHub repository, and the effective date above is updated. The history of changes is visible in the repository's commit history. Continuing to use the Software after a change takes effect means you accept the updated terms.

## 12. Contact

Questions about these terms: open an issue at [github.com/oryanomer1/whoop-mcp/issues](https://github.com/oryanomer1/whoop-mcp/issues) or email **oryandrive@gmail.com**.

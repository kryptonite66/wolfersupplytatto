// calcular-frete.js
export async function handler(event, context) {
  const { cepDestino, quantidade } = event.queryStringParameters;

  const CEP_ORIGEM = process.env.CEP_WOLFER_ORIGEM || "13051207"; 

  const QTD = parseInt(quantidade || 1);
  const PESO_UNITARIO = 0.300; // 300g
  const VALOR_UNITARIO = 74.90;

  const pesoTotal = PESO_UNITARIO * QTD;
  const valorTotal = VALOR_UNITARIO * QTD;

  const DIMENSOES_BASE = {
    altura: 2,
    largura: 11,
    comprimento: 16
  };

  if (!cepDestino) {
    return { statusCode: 400, body: JSON.stringify({ error: "CEP é obrigatório" }) };
  }

  // XML sem credenciais, usando serviços avulsos
  const xmlBody = `
    <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
       <soapenv:Header/>
       <soapenv:Body>
          <tem:CalcPrecoPrazo>
             <tem:nCdEmpresa></tem:nCdEmpresa>
             <tem:sDsSenha></tem:sDsSenha>
             <tem:nCdServico>04014,04510</tem:nCdServico>
             <tem:sCepOrigem>${CEP_ORIGEM}</tem:sCepOrigem>
             <tem:sCepDestino>${cepDestino}</tem:sCepDestino>
             <tem:nVlPeso>${pesoTotal.toFixed(3)}</tem:nVlPeso>
             <tem:nCdFormato>1</tem:nCdFormato>
             <tem:nVlComprimento>${DIMENSOES_BASE.comprimento}</tem:nVlComprimento>
             <tem:nVlAltura>${DIMENSOES_BASE.altura}</tem:nVlAltura>
             <tem:nVlLargura>${DIMENSOES_BASE.largura}</tem:nVlLargura>
             <tem:nVlDiametro>0</tem:nVlDiametro>
             <tem:sCdMaoPropria>N</tem:sCdMaoPropria>
             <tem:nVlValorDeclarado>${valorTotal.toFixed(2)}</tem:nVlValorDeclarado>
             <tem:sCdAvisoRecebimento>N</tem:sCdAvisoRecebimento>
          </tem:CalcPrecoPrazo>
       </soapenv:Body>
    </soapenv:Envelope>
  `;

  try {
    const response = await fetch("http://ws.correios.com.br/calculador/CalcPrecoPrazo.asmx?wsdl", {
      method: "POST",
      headers: {
        "Content-Type": "text/xml;charset=UTF-8",
        "SOAPAction": "http://tempuri.org/CalcPrecoPrazo"
      },
      body: xmlBody
    });

    const xmlText = await response.text();
    const parser = new (require('xmldom').DOMParser)();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    const servicosNode = xmlDoc.getElementsByTagName("cServico");

    let servicos = [];
    for (let i = 0; i < servicosNode.length; i++) {
      const node = servicosNode[i];
      const codigo = node.getElementsByTagName("Codigo")[0].textContent;
      const valor = node.getElementsByTagName("Valor")[0].textContent.replace(",", ".");
      const prazo = node.getElementsByTagName("PrazoEntrega")[0].textContent;
      const erro = node.getElementsByTagName("Erro")[0].textContent;
      const msgErro = node.getElementsByTagName("MsgErro")[0].textContent;

      if (erro === "0") {
        let nomeServico = (codigo === "04014") ? "SEDEX" : "PAC";
        if (parseFloat(valor) > 0) {
          servicos.push({
            name: nomeServico,
            price: parseFloat(valor),
            delivery_time: parseInt(prazo)
          });
        }
      } else {
        console.warn(`Erro serviço ${codigo}: ${msgErro}`);
      }
    }

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(servicos)
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: `Erro interno: ${error.message}` })
    };
  }
}
require('dotenv').config();
const { quais } = require('quais');
const fs = require('fs');
const path = require('path');

// QUAI Testnet RPC endpoints by zone
const RPC_URLS = {
    'cyprus1': 'https://rpc.cyprus1.colosseum.quaiscan.io',
    'cyprus2': 'https://rpc.cyprus2.colosseum.quaiscan.io',
    'cyprus3': 'https://rpc.cyprus3.colosseum.quaiscan.io',
    'paxos1': 'https://rpc.paxos1.colosseum.quaiscan.io',
    'paxos2': 'https://rpc.paxos2.colosseum.quaiscan.io',
    'paxos3': 'https://rpc.paxos3.colosseum.quaiscan.io',
    'hydra1': 'https://rpc.hydra1.colosseum.quaiscan.io',
    'hydra2': 'https://rpc.hydra2.colosseum.quaiscan.io',
    'hydra3': 'https://rpc.hydra3.colosseum.quaiscan.io',
};

async function main() {
    // Load configuration
    const zone = process.env.ZONE || 'cyprus1';
    let privateKey = process.env.PRIVATE_KEY;

    // Fallback to Zone PK
    if (!privateKey) {
        if (zone === 'cyprus1') privateKey = process.env.CYPRUS1_PK;
        if (zone === 'cyprus2') privateKey = process.env.CYPRUS2_PK;
    }
    
    if (!privateKey) {
        console.error('❌ Error: PRIVATE_KEY or zone PK not set in .env file');
        process.exit(1);
    }
    
    const rpcUrl = RPC_URLS[zone.toLowerCase()];
    if (!rpcUrl) {
        console.error(`❌ Error: Unknown zone "${zone}". Available zones: ${Object.keys(RPC_URLS).join(', ')}`);
        process.exit(1);
    }
    
    console.log(`\n🚀 Deploying CardGame to QUAI Testnet (${zone})`);
    console.log(`   RPC: ${rpcUrl}\n`);
    
    // Load compiled contract
    const artifactPath = path.join(__dirname, 'artifacts', 'CardGame.json');
    if (!fs.existsSync(artifactPath)) {
        console.error('❌ Error: Contract not compiled. Run "node compile.js" first.');
        process.exit(1);
    }
    
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    
    // Setup provider and wallet
    const provider = new quais.JsonRpcProvider(rpcUrl);
    const wallet = new quais.Wallet(privateKey, provider);
    
    console.log(`   Deploying from: ${wallet.address}`);
    
    // Check balance
    const balance = await provider.getBalance(wallet.address);
    console.log(`   Balance: ${quais.formatQuai(balance)} QUAI\n`);
    
    if (balance === 0n) {
        console.error('❌ Error: Wallet has no balance. Get testnet QUAI from the faucet.');
        console.log('   Faucet: https://faucet.quai.network/');
        process.exit(1);
    }
    
    // Deploy contract
    console.log('📦 Deploying contract...');
    
    const factory = new quais.ContractFactory(artifact.abi, artifact.bytecode, wallet);
    
    try {
        const contract = await factory.deploy();
        console.log(`   Transaction hash: ${contract.deploymentTransaction().hash}`);
        
        console.log('⏳ Waiting for confirmation...');
        await contract.waitForDeployment();
        
        const contractAddress = await contract.getAddress();
        
        console.log('\n✅ Contract deployed successfully!');
        console.log(`   Address: ${contractAddress}`);
        console.log(`   Explorer: https://${zone}.colosseum.quaiscan.io/address/${contractAddress}`);
        
        // Save deployment info
        const deploymentInfo = {
            contractName: 'CardGame',
            address: contractAddress,
            network: 'quai-testnet',
            zone: zone,
            deployedAt: new Date().toISOString(),
            transactionHash: contract.deploymentTransaction().hash
        };
        
        fs.writeFileSync(
            path.join(__dirname, 'artifacts', 'deployment.json'),
            JSON.stringify(deploymentInfo, null, 2)
        );
        
        console.log('\n📝 Deployment info saved to artifacts/deployment.json');
        
    } catch (error) {
        console.error('\n❌ Deployment failed:', error.message);
        if (error.code === 'INSUFFICIENT_FUNDS') {
            console.log('   Get testnet QUAI from: https://faucet.quai.network/');
        }
        process.exit(1);
    }
}

main().catch(console.error);

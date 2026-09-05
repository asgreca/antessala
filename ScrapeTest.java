import java.net.URL;
import java.net.HttpURLConnection;
import java.io.InputStreamReader;
import java.io.BufferedReader;
public class ScrapeTest {
    public static void main(String[] args) throws Exception {
        URL url = new URL("https://www.in.gov.br/consulta/-/buscar/dou?q=%22Casa+Civil%22+%22extrato+de+contrato%22&s=3");
        HttpURLConnection con = (HttpURLConnection) url.openConnection();
        con.setRequestProperty("User-Agent", "Mozilla/5.0");
        BufferedReader in = new BufferedReader(new InputStreamReader(con.getInputStream()));
        String inputLine;
        while ((inputLine = in.readLine()) != null) {
            if(inputLine.contains("resultados para")) System.out.println(inputLine.trim());
            if(inputLine.contains("title-marker")) System.out.println(inputLine.trim());
        }
        in.close();
    }
}

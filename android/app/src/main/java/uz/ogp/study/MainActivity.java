package uz.ogp.study;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Не увеличивать интерфейс вслед за системным размером шрифта:
        // иначе при крупном шрифте в настройках телефона приложение не помещается на экран.
        // Размер текста в читалке пользователь меняет в настройках самого приложения.
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().getSettings().setTextZoom(100);
        }
    }
}

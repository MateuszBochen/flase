<?php

namespace App\Controller;

use Doctrine\DBAL\DriverManager;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;

/**
 * class LoginController
 * @package ${NAMESPACE}
 * @author Mateusz Bochen
 */
class LoginController
{
    #[Route('/api/login', name: 'login_action')]
    public function login(Request $request): JsonResponse
    {

        $host = $request->get('host');
        $login = $request->get('login');
        $password = $request->get('password');

        $connectionParams = [
            //'host' => '88.80.190.228',
            'driver' => 'pdo_mysql',
        ];

        if ($host) {
            $connectionParams['host'] = $host;
        }

        if ($password) {
            $connectionParams['password'] = $password;
        }

        if ($login) {
            $connectionParams['user'] = $login;
        } else {
            return new JsonResponse(['message' => 'error', 'data' => 'Invalid User name'], Response::HTTP_UNAUTHORIZED);
        }

        try {
            $conn = DriverManager::getConnection($connectionParams);
            $sql = "SHOW DATABASES";
            $stmt = $conn->executeQuery($sql);
            $data = $stmt->fetchAllAssociative();
            return new JsonResponse(['message' => 'ok', 'data' => $data], Response::HTTP_OK);
        } catch (\Exception $exception) {
            return new JsonResponse(['message' => 'error', 'data' => $exception->getMessage()], Response::HTTP_UNAUTHORIZED);
        }
    }
}
